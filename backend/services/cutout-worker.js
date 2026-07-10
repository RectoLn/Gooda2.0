// 抠图推理 worker：onnxruntime-web 的 WASM 计算在【调用线程】同步执行,放在主线程会
// 把整个 Node 事件循环冻结数秒(线上 ~1 vCPU 实测 3-5s+)——期间 /spu/* 全部无响应,
// 曾被误诊为"安卓才有的 503"。所以 ort 的加载/session/推理全部住在这个 worker 里,
// 主线程只做 sharp 预处理、队列与超时。
//
// 协议(postMessage):
//   主→worker { id, rgbS: ArrayBuffer(S*S*3 u8), S, modelName, modelPath, mean, std, threads }
//   worker→主 { id, ok: true, alpha: ArrayBuffer(f32), bin: ArrayBuffer(u8) }
//          或 { id, ok: false, kind, message }
const { parentPort } = require('worker_threads')
const fs = require('fs')

let ort = null
let configuredThreads = 0
const sessions = {} // modelName -> Promise<InferenceSession>

function loadOrt(threads) {
  if (!ort) {
    ort = require('onnxruntime-web')
    ort.env.wasm.numThreads = threads || 1
    configuredThreads = threads || 1
  }
  return ort
}

function getSession(modelName, modelPath, threads) {
  // threads 变化时重建(health?threads= 在线调参)
  if (sessions[modelName] && configuredThreads !== (threads || 1)) delete sessions[modelName]
  if (!sessions[modelName]) {
    const o = loadOrt(threads)
    sessions[modelName] = o.InferenceSession.create(new Uint8Array(fs.readFileSync(modelPath)), {
      executionProviders: ['wasm'],
    }).catch((err) => {
      delete sessions[modelName]
      throw err
    })
  }
  return sessions[modelName]
}

parentPort.on('message', async (msg) => {
  const { id, rgbS: rgbBuf, S, modelName, modelPath, mean, std, threads } = msg
  try {
    const o = loadOrt(threads)
    const session = await getSession(modelName, modelPath, threads)
    const rgbS = new Uint8Array(rgbBuf)

    // HWC u8 → CHW f32 归一化
    const plane = S * S
    const input = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      input[i] = (rgbS[i * 3] / 255 - mean[0]) / std[0]
      input[plane + i] = (rgbS[i * 3 + 1] / 255 - mean[1]) / std[1]
      input[2 * plane + i] = (rgbS[i * 3 + 2] / 255 - mean[2]) / std[2]
    }

    const feeds = { [session.inputNames[0]]: new o.Tensor('float32', input, [1, 3, S, S]) }
    const outputs = await session.run(feeds)
    const pred = outputs[session.outputNames[0]].data // [1,1,S,S]

    let mi = Infinity
    let ma = -Infinity
    for (let i = 0; i < plane; i++) {
      if (pred[i] < mi) mi = pred[i]
      if (pred[i] > ma) ma = pred[i]
    }
    const range = ma - mi
    if (!(range > 1e-6)) {
      parentPort.postMessage({ id, ok: false, kind: 'no-subject', message: '未能识别出主体' })
      return
    }

    const alpha = new Float32Array(plane)
    const bin = new Uint8Array(plane)
    for (let i = 0; i < plane; i++) {
      const v = (pred[i] - mi) / range
      alpha[i] = v
      if (v >= 0.5) bin[i] = 1
    }
    parentPort.postMessage({ id, ok: true, alpha: alpha.buffer, bin: bin.buffer }, [alpha.buffer, bin.buffer])
  } catch (err) {
    parentPort.postMessage({ id, ok: false, kind: 'internal', message: err && err.message ? err.message : String(err) })
  }
})
