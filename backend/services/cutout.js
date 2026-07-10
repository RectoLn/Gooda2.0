// 抠图服务：本地 ONNX 推理（ISNet int8 主模型 / u2netp 降级），照片只在内存里流转，
// 不落盘、不外传第三方。模型来源与许可证见 ../models-onnx/README.md。
//
// onnxruntime-node / sharp 是原生依赖：加载失败时 /cutout 返回"服务不可用"，
// 但绝不能拖垮零依赖就能跑的 /spu/*，所以全部 require 都是懒加载 + 捕获。
const path = require('path')
const fs = require('fs')
const os = require('os')

const MODELS_DIR = path.join(__dirname, '..', 'models-onnx')
// 可运行时调整（health?size=&threads=，见 setTuning）：qdmp 容器 CPU 很弱且没有改 env
// 的入口，1024² 在线上 WASM 要 20s+，需要在线试出"质量×耗时"的平衡点而不必每次发版。
let inputSize = clampInt(process.env.CUTOUT_INPUT_SIZE, 256, 1024, 1024)
let threads = clampInt(process.env.CUTOUT_THREADS, 1, 8, 4)
// 工作分辨率上限（EXIF 旋转后先缩到这个尺寸再推理/合成），输出裁切后再限到 OUTPUT_MAX
const WORK_MAX = 1536
const OUTPUT_MAX = 1280
const QUEUE_MAX = 4
const JOB_TIMEOUT_MS = clampInt(process.env.CUTOUT_TIMEOUT_MS, 5000, 60000, 25000)

const MODEL_SPECS = {
  isnet: {
    file: 'isnet-general-use.int8.onnx',
    size: 0, // 0 = 跟随可调的 inputSize
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
  },
  u2netp: {
    file: 'u2netp.onnx',
    size: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
}

class CutoutError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'unavailable' | 'busy' | 'timeout' | 'bad-input' | 'no-subject' | 'internal'
  }
}

function clampInt(raw, min, max, dflt) {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

// ---- 懒加载原生依赖 ------------------------------------------------------

// 推理运行时两级：优先 onnxruntime-node（glibc 原生，最快，run 在 ORT 自有线程池、
// 不阻塞事件循环）；加载失败（如 qdmp 线上容器是 musl/Alpine，没有
// ld-linux-x86-64.so.2）落到 onnxruntime-web 纯 WASM。WASM 的计算在调用线程同步
// 执行，一次推理会把事件循环冻结数秒（线上曾拖垮 /spu/* 全部接口）——所以 WASM
// 路径的 ort 不在主线程加载，推理走 cutout-worker.js（worker_threads）。
// CUTOUT_FORCE_WASM=1 可强制走 WASM 验证。
let deps = null // { ort?, sharp, runtime: 'native'|'wasm' } | { error }
function loadDeps() {
  if (deps) return deps
  let sharp
  try {
    sharp = require('sharp')
  } catch (err) {
    console.error('[cutout] sharp unavailable:', err.message)
    deps = { error: `sharp: ${err.message}` }
    return deps
  }
  let nativeErr = ''
  if (process.env.CUTOUT_FORCE_WASM !== '1') {
    try {
      deps = { ort: require('onnxruntime-node'), sharp, runtime: 'native' }
      return deps
    } catch (err) {
      nativeErr = err.message
      console.warn('[cutout] onnxruntime-node unavailable, falling back to wasm:', nativeErr)
    }
  }
  try {
    require.resolve('onnxruntime-web') // 只探测存在性；真正加载发生在 worker 里
    // qdmp 线上容器 ~1 vCPU 且共享：实测 1024²@4线程 20s+ 超时，512²@1线程最优。
    if (!process.env.CUTOUT_INPUT_SIZE) inputSize = Math.min(inputSize, 512)
    if (!process.env.CUTOUT_THREADS) threads = 1
    deps = { sharp, runtime: 'wasm' }
  } catch (err) {
    console.error('[cutout] onnxruntime wasm unavailable:', err.message)
    deps = { error: `onnxruntime-node: ${nativeErr} / onnxruntime-web: ${err.message}` }
  }
  return deps
}

// ---- WASM 推理 worker（见 cutout-worker.js 头注释） -----------------------

let worker = null
let workerSeq = 0
const workerPending = new Map() // id -> { resolve, reject }
const workerModels = new Set() // 已在 worker 里成功建过 session 的模型（健康上报用）

function ensureWorker() {
  if (worker) return worker
  const { Worker } = require('worker_threads')
  worker = new Worker(path.join(__dirname, 'cutout-worker.js'))
  worker.unref() // 不阻止进程退出
  worker.on('message', (msg) => {
    const p = workerPending.get(msg.id)
    if (!p) return // 超时后迟到的回包，丢弃
    workerPending.delete(msg.id)
    if (msg.ok) p.resolve(msg)
    else p.reject(new CutoutError(msg.kind === 'no-subject' ? 'no-subject' : 'internal', msg.message))
  })
  worker.on('error', (err) => {
    console.error('[cutout] worker crashed:', err.message)
    failAllPending(`推理线程崩溃：${err.message}`)
    worker = null
  })
  worker.on('exit', (code) => {
    if (code !== 0) failAllPending(`推理线程退出（code ${code}）`)
    worker = null
  })
  return worker
}

function failAllPending(message) {
  for (const [, p] of workerPending) p.reject(new CutoutError('internal', message))
  workerPending.clear()
}

// 超时/调参后重建：WASM 算不到一半没法中断，只能整个线程掐掉，防止队列后续任务
// 排在一个已经没人等的死算后面。
function resetWorker() {
  if (worker) {
    try { worker.terminate() } catch (_) {}
    worker = null
  }
  failAllPending('推理线程已重置')
}

function workerInfer({ rgbS, S, modelName, modelPath }) {
  const w = ensureWorker()
  const id = ++workerSeq
  return new Promise((resolve, reject) => {
    workerPending.set(id, { resolve, reject })
    const buf = rgbS.buffer.slice(rgbS.byteOffset, rgbS.byteOffset + rgbS.byteLength)
    const spec = MODEL_SPECS[modelName]
    w.postMessage({ id, rgbS: buf, S, modelName, modelPath, mean: spec.mean, std: spec.std, threads }, [buf])
  }).then((msg) => {
    workerModels.add(modelName)
    return msg
  })
}

// qdmp 发版有单文件 10MB 上限：大模型以 <10MB 分片（file.part-aa…）随包部署，
// 首次使用时在可写的系统临时目录拼回整文件。本地开发放整文件则直接用。
function ensureModelPath(file) {
  const whole = path.join(MODELS_DIR, file)
  if (fs.existsSync(whole)) return whole
  const parts = fs.readdirSync(MODELS_DIR).filter((n) => n.startsWith(`${file}.part-`)).sort()
  if (!parts.length) throw new Error(`模型文件缺失：${file}（也没有分片）`)
  const assembled = path.join(os.tmpdir(), 'gooda-models', file)
  const total = parts.reduce((sum, n) => sum + fs.statSync(path.join(MODELS_DIR, n)).size, 0)
  if (fs.existsSync(assembled) && fs.statSync(assembled).size === total) return assembled
  fs.mkdirSync(path.dirname(assembled), { recursive: true })
  const tmp = `${assembled}.assembling`
  const out = fs.openSync(tmp, 'w')
  try {
    for (const part of parts) fs.writeSync(out, fs.readFileSync(path.join(MODELS_DIR, part)))
  } finally {
    fs.closeSync(out)
  }
  fs.renameSync(tmp, assembled)
  console.log(`[cutout] assembled ${file} from ${parts.length} parts (${total} bytes)`)
  return assembled
}

const sessions = {} // name -> Promise<InferenceSession>
function getSession(name) {
  if (!sessions[name]) {
    const { ort, runtime, error } = loadDeps()
    if (error) return Promise.reject(new CutoutError('unavailable', `推理依赖未就绪：${error}`))
    const spec = MODEL_SPECS[name]
    sessions[name] = Promise.resolve()
      .then(() => ensureModelPath(spec.file))
      .then((modelPath) => (runtime === 'wasm'
        // wasm 版从内存加载模型；线程数走 ort.env.wasm（loadDeps 已设）
        ? ort.InferenceSession.create(new Uint8Array(fs.readFileSync(modelPath)), { executionProviders: ['wasm'] })
        : ort.InferenceSession.create(modelPath, {
          intraOpNumThreads: threads,
          graphOptimizationLevel: 'all',
        })))
      .catch((err) => {
        delete sessions[name] // 失败不缓存，下次可重试
        throw new CutoutError('unavailable', `模型 ${name} 加载失败：${err.message}`)
      })
  }
  return sessions[name]
}

// ---- 串行推理队列（防 OOM）----------------------------------------------

let queueLength = 0
let queueTail = Promise.resolve()
const stats = { totalRuns: 0, totalFails: 0, lastDurationMs: 0, lastModel: '', lastError: '' }

function enqueue(job) {
  if (queueLength >= QUEUE_MAX) {
    return Promise.reject(new CutoutError('busy', '抠图服务繁忙，请稍后重试'))
  }
  queueLength++
  const run = queueTail.then(job).finally(() => { queueLength-- })
  // 队列尾部吞掉错误，避免一次失败让后续任务全部 rejected
  queueTail = run.catch(() => {})
  return run
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new CutoutError('timeout', `抠图超时（>${Math.round(ms / 1000)}s）`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ---- mask 后处理（纯 JS，S×S 尺度）---------------------------------------

// 连通域标记：选出"主体"连通域（面积 × 居中程度加权——用户实拍时主体一般居中占大，
// 避免选中画面边上的大件背景物），只保留主体和 ≥60% 主体大小的伴随块。
// 返回 { keep: Uint8Array(S*S) 0/1, area, bbox: {x0,y0,x1,y1} } 或 null（没有可用主体）。
function keepMainComponents(bin, S) {
  const labels = new Int32Array(S * S) // 0 = 未标记
  const areas = [0]
  const cxs = [0]
  const cys = [0]
  const stack = new Int32Array(S * S)
  let nextLabel = 1
  for (let start = 0; start < S * S; start++) {
    if (!bin[start] || labels[start]) continue
    let top = 0
    stack[top++] = start
    labels[start] = nextLabel
    let area = 0
    let sumX = 0
    let sumY = 0
    while (top > 0) {
      const p = stack[--top]
      area++
      const x = p % S
      const y = (p / S) | 0
      sumX += x
      sumY += y
      if (x > 0 && bin[p - 1] && !labels[p - 1]) { labels[p - 1] = nextLabel; stack[top++] = p - 1 }
      if (x < S - 1 && bin[p + 1] && !labels[p + 1]) { labels[p + 1] = nextLabel; stack[top++] = p + 1 }
      if (y > 0 && bin[p - S] && !labels[p - S]) { labels[p - S] = nextLabel; stack[top++] = p - S }
      if (y < S - 1 && bin[p + S] && !labels[p + S]) { labels[p + S] = nextLabel; stack[top++] = p + S }
    }
    areas.push(area)
    cxs.push(sumX / area)
    cys.push(sumY / area)
    nextLabel++
  }
  let main = 0
  let bestScore = 0
  const half = S / 2
  for (let l = 1; l < areas.length; l++) {
    const dx = (cxs[l] - half) / half
    const dy = (cys[l] - half) / half
    const score = areas[l] * Math.exp(-(dx * dx + dy * dy))
    if (score > bestScore) { bestScore = score; main = l }
  }
  if (!main || areas[main] < S * S * 0.002) return null

  const minKeep = areas[main] * 0.6
  const keepLabel = new Uint8Array(areas.length)
  keepLabel[main] = 1
  for (let l = 1; l < areas.length; l++) if (areas[l] >= minKeep) keepLabel[l] = 1

  const keep = new Uint8Array(S * S)
  let area = 0
  let x0 = S, y0 = S, x1 = -1, y1 = -1
  for (let p = 0; p < S * S; p++) {
    if (!keepLabel[labels[p]]) continue
    keep[p] = 1
    area++
    const x = p % S
    const y = (p / S) | 0
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { keep, area, bbox: { x0, y0, x1, y1 } }
}

// 3×3 膨胀 iters 次：让保留区罩住主体的软边缘（软 alpha 略宽于 0.5 阈值的硬掩码）
function dilate(mask, S, iters) {
  let cur = mask
  for (let i = 0; i < iters; i++) {
    const next = new Uint8Array(S * S)
    for (let p = 0; p < S * S; p++) {
      if (!cur[p]) continue
      const x = p % S
      const y = (p / S) | 0
      next[p] = 1
      if (x > 0) next[p - 1] = 1
      if (x < S - 1) next[p + 1] = 1
      if (y > 0) next[p - S] = 1
      if (y < S - 1) next[p + S] = 1
    }
    cur = next
  }
  return cur
}

// ---- 推理主流程 -----------------------------------------------------------

async function inferAlpha(modelName, workRgb, W, H) {
  const { ort, sharp, runtime } = loadDeps()
  const spec = MODEL_SPECS[modelName]
  const S = spec.size || inputSize

  const { data: rgbS } = await sharp(workRgb, { raw: { width: W, height: H, channels: 3 } })
    .resize(S, S, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (runtime === 'wasm') {
    // WASM 的计算同步占住调用线程 → 挪到 worker，主线程事件循环保持响应
    const msg = await workerInfer({ rgbS, S, modelName, modelPath: ensureModelPath(spec.file) })
    return { alpha: new Float32Array(msg.alpha), bin: new Uint8Array(msg.bin), S }
  }

  const session = await getSession(modelName)

  // HWC u8 → CHW f32 归一化
  const plane = S * S
  const input = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    input[i] = (rgbS[i * 3] / 255 - spec.mean[0]) / spec.std[0]
    input[plane + i] = (rgbS[i * 3 + 1] / 255 - spec.mean[1]) / spec.std[1]
    input[2 * plane + i] = (rgbS[i * 3 + 2] / 255 - spec.mean[2]) / spec.std[2]
  }

  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) }
  const outputs = await session.run(feeds)
  const pred = outputs[session.outputNames[0]].data // [1,1,S,S]（u2netp 取融合输出 d0）

  let mi = Infinity, ma = -Infinity
  for (let i = 0; i < plane; i++) {
    if (pred[i] < mi) mi = pred[i]
    if (pred[i] > ma) ma = pred[i]
  }
  const range = ma - mi
  if (!(range > 1e-6)) throw new CutoutError('no-subject', '未能识别出主体')

  const alpha = new Float32Array(plane)
  const bin = new Uint8Array(plane)
  for (let i = 0; i < plane; i++) {
    const v = (pred[i] - mi) / range
    alpha[i] = v
    if (v >= 0.5) bin[i] = 1
  }
  return { alpha, bin, S }
}

// iOS 相册原图是 HEIC（HEVC 编码）。sharp 预编译的 libvips 带 libheif 但没有 HEVC
// 解码插件（专利问题，实测线上报 "No decoding plugin installed"），所以 sharp 解码
// 失败且探测到 HEIF 容器时，用 heic-decode（libheif-js 纯 WASM，无原生依赖）解成
// RGBA raw 再回喂 sharp。懒加载 + 捕获：包缺失只影响 HEIC 图，不拖垮其他格式。
function isHeifContainer(buf) {
  if (!buf || buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return false
  const brand = buf.toString('ascii', 8, 12)
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)
}
async function decodeHeicToRaw(buf) {
  let decode
  try {
    decode = require('heic-decode')
  } catch (err) {
    throw new CutoutError('bad-input', `iPhone HEIC 图片暂不支持（解码器未装载：${err.message}）`)
  }
  const { width, height, data } = await decode({ buffer: buf })
  // libheif 解码时已应用 irot/imir 旋转变换，无需再按 EXIF 旋转
  return { raw: Buffer.from(data), width, height }
}

async function runCutout(imageBuffer) {
  const { sharp, error } = loadDeps()
  if (error) throw new CutoutError('unavailable', `推理依赖未就绪：${error}`)

  // EXIF 旋转 + 限制工作分辨率，拿到贯穿全程的工作图（raw RGB）
  let work
  try {
    work = await sharp(imageBuffer)
      .rotate()
      .resize(WORK_MAX, WORK_MAX, { fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  } catch (err) {
    if (!isHeifContainer(imageBuffer)) throw new CutoutError('bad-input', `图片解码失败：${err.message}`)
    try {
      const { raw, width, height } = await decodeHeicToRaw(imageBuffer)
      work = await sharp(raw, { raw: { width, height, channels: 4 } })
        .resize(WORK_MAX, WORK_MAX, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    } catch (heicErr) {
      if (heicErr instanceof CutoutError) throw heicErr
      throw new CutoutError('bad-input', `HEIC 图片解码失败：${heicErr.message}`)
    }
  }
  const { width: W, height: H } = work.info

  // 真·纯色图（误拍桌面/白墙）：模型对无内容画面会"幻觉"出主体，用图像方差先挡掉。
  // 阈值保守（std<3），避免误伤色纸等低纹理谷子。
  {
    let sum = 0
    let sumSq = 0
    let n = 0
    for (let i = 0; i < work.data.length; i += 48) { // 每 16 像素采一个通道
      sum += work.data[i]
      sumSq += work.data[i] * work.data[i]
      n++
    }
    const mean = sum / n
    if (Math.sqrt(Math.max(0, sumSq / n - mean * mean)) < 3) {
      throw new CutoutError('no-subject', '画面内容过于单一，未能识别出主体')
    }
  }

  // 主模型失败（加载/推理/OOM）自动降级 u2netp；no-subject 不降级（换模型也救不回来）
  let modelUsed = 'isnet'
  let inferred
  try {
    inferred = await inferAlpha('isnet', work.data, W, H)
  } catch (err) {
    if (err instanceof CutoutError && (err.kind === 'no-subject' || err.kind === 'bad-input')) throw err
    console.warn('[cutout] isnet failed, falling back to u2netp:', err.message)
    modelUsed = 'u2netp'
    inferred = await inferAlpha('u2netp', work.data, W, H)
  }
  const { alpha, bin, S } = inferred

  const main = keepMainComponents(bin, S)
  if (!main) throw new CutoutError('no-subject', '未能识别出主体')

  // 软 alpha × 膨胀后的保留区 → u8 掩码
  const keepSoft = dilate(main.keep, S, 3)
  const maskU8 = Buffer.alloc(S * S)
  for (let p = 0; p < S * S; p++) {
    maskU8[p] = keepSoft[p] ? Math.round(alpha[p] * 255) : 0
  }

  // bbox：主体外扩 4% 留白（S 尺度 → 工作图尺度）
  const { x0, y0, x1, y1 } = main.bbox
  const padS = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04) + 1
  const sx = W / S
  const sy = H / S
  const bx = Math.max(0, Math.round((x0 - padS) * sx))
  const by = Math.max(0, Math.round((y0 - padS) * sy))
  const bw = Math.min(W, Math.round((x1 + padS + 1) * sx)) - bx
  const bh = Math.min(H, Math.round((y1 + padS + 1) * sy)) - by

  // 掩码放大回工作图，逐像素并进 RGBA。
  // 注意：sharp 对 1 通道 raw 做 resize 后输出可能升为 3 通道，必须按实际通道数索引。
  const maskRes = await sharp(maskU8, { raw: { width: S, height: S, channels: 1 } })
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const maskFull = maskRes.data
  const mch = maskRes.info.channels
  const rgba = Buffer.alloc(W * H * 4)
  for (let p = 0; p < W * H; p++) {
    rgba[p * 4] = work.data[p * 3]
    rgba[p * 4 + 1] = work.data[p * 3 + 1]
    rgba[p * 4 + 2] = work.data[p * 3 + 2]
    rgba[p * 4 + 3] = maskFull[p * mch]
  }

  let out = sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: bx, top: by, width: bw, height: bh })
  if (Math.max(bw, bh) > OUTPUT_MAX) {
    out = out.resize(OUTPUT_MAX, OUTPUT_MAX, { fit: 'inside' })
  }
  const png = await out.png().toBuffer()
  const outMeta = await sharp(png).metadata()

  // 形状建议指标：填充率（主体面积/自身 bbox）+ 长宽比 + 与理想圆的 IoU。
  // circleIoU 用质心 + 等面积圆比对，是"圆形吧唧"最可靠的判据（fillRatio 会被
  // 底座/挂环拉低，心形等实心形状又会把 fillRatio 抬到接近圆）。
  let circleIoU = 0
  {
    let sumX = 0
    let sumY = 0
    for (let p = 0; p < S * S; p++) {
      if (!main.keep[p]) continue
      sumX += p % S
      sumY += (p / S) | 0
    }
    const cx = sumX / main.area
    const cy = sumY / main.area
    const r2 = main.area / Math.PI
    let inter = 0
    let union = 0
    for (let p = 0; p < S * S; p++) {
      const dx = (p % S) - cx
      const dy = ((p / S) | 0) - cy
      const inCircle = dx * dx + dy * dy <= r2
      if (main.keep[p] && inCircle) inter++
      if (main.keep[p] || inCircle) union++
    }
    circleIoU = union ? Math.round((inter / union) * 1000) / 1000 : 0
  }

  const bboxAreaS = (x1 - x0 + 1) * (y1 - y0 + 1)
  return {
    png,
    width: outMeta.width,
    height: outMeta.height,
    bbox: { x: bx, y: by, w: bw, h: bh, imageW: W, imageH: H },
    metrics: {
      fillRatio: Math.round((main.area / bboxAreaS) * 1000) / 1000,
      aspect: Math.round((((x1 - x0 + 1) * sx) / Math.max(1, (y1 - y0 + 1) * sy)) * 1000) / 1000,
      circleIoU,
    },
    model: modelUsed,
  }
}

// ---- 对外入口 -------------------------------------------------------------

function removeBackground(imageBuffer) {
  return enqueue(async () => {
    const t0 = Date.now()
    try {
      const result = await withTimeout(runCutout(imageBuffer), JOB_TIMEOUT_MS)
      stats.totalRuns++
      stats.lastDurationMs = Date.now() - t0
      stats.lastModel = result.model
      stats.lastError = ''
      return { ...result, durationMs: stats.lastDurationMs }
    } catch (err) {
      stats.totalFails++
      stats.lastError = err.message
      // WASM 死算没法中断：超时后掐掉 worker，别让队列后续任务排在僵尸计算后面
      if (err instanceof CutoutError && err.kind === 'timeout' && deps && deps.runtime === 'wasm') {
        resetWorker()
      }
      throw err
    }
  })
}

async function healthInfo(warm) {
  const d = loadDeps()
  const info = {
    available: !d.error,
    reason: d.error || '',
    runtime: d.runtime || '',
    inputSize,
    threads,
    queueLength,
    ...stats,
    modelsLoaded: d.runtime === 'wasm' ? [...workerModels] : Object.keys(sessions),
  }
  if (warm && !d.error) {
    try {
      if (d.runtime === 'wasm') {
        // 预热 = 让 worker 建好 isnet session：喂一张 64² 的迷你图跑通全链
        const S = 64
        const rgbS = new Uint8Array(S * S * 3)
        for (let i = 0; i < rgbS.length; i++) rgbS[i] = (i * 7) & 0xff
        await withTimeout(
          workerInfer({ rgbS, S, modelName: 'isnet', modelPath: ensureModelPath(MODEL_SPECS.isnet.file) }),
          JOB_TIMEOUT_MS,
        ).catch((err) => {
          // no-subject 也算预热成功（session 已建好），其余错误上抛
          if (!(err instanceof CutoutError && err.kind === 'no-subject')) throw err
          workerModels.add('isnet')
        })
        info.modelsLoaded = [...workerModels]
      } else {
        await getSession('isnet')
        info.modelsLoaded = Object.keys(sessions)
      }
      info.warmed = true
    } catch (err) {
      info.available = false
      info.reason = err.message
    }
  }
  return info
}

// 运行时调参（health?size=&threads=）：值有界，只影响推理开销，不触碰数据面。
// 改动后丢弃 session 缓存让新参数生效（wasm 线程数也要重设）。
function setTuning({ size, threads: th }) {
  let changed = false
  if (size !== undefined) {
    const v = clampInt(size, 256, 1024, inputSize)
    if (v !== inputSize) { inputSize = v; changed = true }
  }
  if (th !== undefined) {
    const v = clampInt(th, 1, 8, threads)
    if (v !== threads) {
      threads = v
      changed = true
    }
  }
  if (changed) {
    for (const k of Object.keys(sessions)) delete sessions[k]
    // WASM 线程池初始化后改不了线程数 → 直接重建 worker（size 变化也顺带清 session）
    if (deps && deps.runtime === 'wasm') {
      resetWorker()
      workerModels.clear()
    }
  }
  return { inputSize, threads, changed }
}

module.exports = {
  removeBackground, healthInfo, setTuning, CutoutError,
  // 供 /image/v1/ingest 共享的解码工具（sharp 无 HEVC 插件 → heic-decode 前置解码）
  isHeifContainer, decodeHeicToRaw,
}
