// 抠图路由：POST /cutout/v1/remove（base64 进、透明 PNG base64 出）+ GET /cutout/v1/health。
// 响应壳与 /spu/* 一致（code 字符串，"0" 为成功）；业务性失败（no-subject）用 200 + 业务码，
// 服务性失败（busy/unavailable/timeout）用 5xx，前端按 kind 分级提示并回退手动裁剪。
const { removeBackground, healthInfo, setTuning, CutoutError } = require('../services/cutout')

// base64 膨胀 ~4/3：15MB 请求体 ≈ 11MB 原图，覆盖手机原图直传的兜底场景
const BODY_LIMIT = 15 * 1024 * 1024
const IMAGE_LIMIT = 10 * 1024 * 1024

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new CutoutError('bad-input', `请求体超过 ${Math.round(limit / 1024 / 1024)}MB 上限`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', (err) => reject(new CutoutError('bad-input', `请求读取失败：${err.message}`)))
  })
}

const ERROR_HTTP = { 'bad-input': 400, 'no-subject': 200, busy: 503, unavailable: 503, timeout: 504, internal: 500 }
const ERROR_CODE = { 'bad-input': 'BAD_INPUT', 'no-subject': 'NO_SUBJECT', busy: 'BUSY', unavailable: 'UNAVAILABLE', timeout: 'TIMEOUT', internal: 'INTERNAL' }

function sendCutoutError(res, err) {
  if (err instanceof CutoutError) {
    sendJson(res, ERROR_HTTP[err.kind] || 500, { code: ERROR_CODE[err.kind] || 'INTERNAL', message: err.message })
    return
  }
  console.error('[cutout]', err)
  sendJson(res, 500, { code: 'INTERNAL', message: '抠图服务内部错误' })
}

async function handleCutoutRemove(req, res) {
  try {
    const raw = await readBody(req, BODY_LIMIT)
    let image = ''
    try {
      image = String(JSON.parse(raw.toString('utf8')).image || '')
    } catch (_) {
      throw new CutoutError('bad-input', '请求体不是合法 JSON（期望 { image: base64 }）')
    }
    // 兼容 data URL 前缀
    const b64 = image.replace(/^data:image\/[\w+.-]+;base64,/, '')
    if (!b64) throw new CutoutError('bad-input', '缺少 image 字段')
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 100) throw new CutoutError('bad-input', 'image 不是有效的 base64 图片')
    if (buf.length > IMAGE_LIMIT) throw new CutoutError('bad-input', `图片超过 ${Math.round(IMAGE_LIMIT / 1024 / 1024)}MB 上限`)

    const result = await removeBackground(buf)
    sendJson(res, 200, {
      code: '0',
      message: '',
      data: {
        image: result.png.toString('base64'),
        mime: 'image/png',
        width: result.width,
        height: result.height,
        bbox: result.bbox,
        metrics: result.metrics,
        model: result.model,
        durationMs: result.durationMs,
      },
    })
  } catch (err) {
    sendCutoutError(res, err)
  }
}

async function handleCutoutHealth(req, res, query) {
  // 运维调参入口：?size=512&threads=2（有界钳制）——qdmp 容器没有改 env 的入口，
  // 线上性能只能在线试参。改动后 ?warm=1 会按新参数重建 session。
  if (query.size !== undefined || query.threads !== undefined) {
    setTuning({ size: query.size, threads: query.threads })
  }
  const info = await healthInfo(String(query.warm || '') === '1')
  sendJson(res, 200, { code: '0', message: '', data: info })
}

module.exports = { handleCutoutRemove, handleCutoutHealth }
