// 图片摄取路由：POST /image/v1/ingest（multipart 单文件进、data URL JSON 出）。
//
// 为什么存在：Dimina 各端的本地文件桥参差不齐——iOS 上 getFileSystemManager.readFile
// 对相册/拍摄的临时文件直接失败（相册、拍摄都报"图片处理失败"），安卓/鸿蒙上把整张
// 原图 readFile 成 base64 又是数 MB 字符串过桥（卡顿+概率闪退）。Taro.uploadFile 直传
// filePath 由原生网络栈读文件，完全绕开 readFile/base64/桥体积限制。后端顺带做统一
// 转码（含 HEIC）、EXIF 旋转、降采样，返回小 data URL + 精确尺寸——前端不用再测量。
const busboy = require('busboy')
const { isHeifContainer, decodeHeicToRaw, CutoutError } = require('../services/cutout')

const FILE_LIMIT = 25 * 1024 * 1024
const INGEST_MAX = 1600 // 输出最长边：画布/裁剪台用途足够，1600² JPEG ≈ 300-600KB

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function readMultipartFile(req, limit) {
  return new Promise((resolve, reject) => {
    let bb
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: limit } })
    } catch (err) {
      reject(new Error(`不是合法的 multipart 请求：${err.message}`))
      return
    }
    let done = false
    const finish = (fn) => { if (!done) { done = true; fn() } }
    let got = false
    bb.on('file', (name, stream) => {
      got = true
      const chunks = []
      stream.on('data', (c) => chunks.push(c))
      stream.on('limit', () => finish(() => reject(new Error(`文件超过 ${Math.round(limit / 1024 / 1024)}MB 上限`))))
      stream.on('end', () => finish(() => resolve(Buffer.concat(chunks))))
    })
    bb.on('error', (err) => finish(() => reject(err)))
    bb.on('finish', () => { if (!got) finish(() => reject(new Error('缺少文件字段'))) })
    req.pipe(bb)
  })
}

async function handleImageIngest(req, res) {
  let sharp
  try {
    sharp = require('sharp')
  } catch (err) {
    sendJson(res, 503, { code: 'UNAVAILABLE', message: `图片服务未就绪：${err.message}` })
    return
  }
  try {
    const buf = await readMultipartFile(req, FILE_LIMIT)
    if (!buf || buf.length < 100) {
      sendJson(res, 400, { code: 'BAD_INPUT', message: '文件为空或过小' })
      return
    }

    // 解码（sharp 优先；HEIC 用 heic-decode 前置解）→ EXIF 旋转 → 降采样 → 重编码。
    // 注意 sharp 对 HEIC 的 metadata() 能读容器头【不会报错】，真正的 HEVC 解码失败
    // 发生在 toBuffer() —— 所以必须整链执行完再决定要不要走 heic-decode 重建。
    const encode = (pipeline, hasAlpha) => {
      const p = pipeline.resize(INGEST_MAX, INGEST_MAX, { fit: 'inside', withoutEnlargement: true })
      // 有透明保 PNG（谷子透明图），否则 JPEG（照片体积小一个数量级）
      return hasAlpha
        ? p.png().toBuffer({ resolveWithObject: true }).then((r) => ({ ...r, mime: 'image/png' }))
        : p.jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true }).then((r) => ({ ...r, mime: 'image/jpeg' }))
    }
    let out
    try {
      const meta = await sharp(buf).metadata()
      out = await encode(sharp(buf).rotate(), !!meta.hasAlpha)
    } catch (err) {
      if (!isHeifContainer(buf)) {
        sendJson(res, 400, { code: 'BAD_INPUT', message: `图片解码失败：${err.message}` })
        return
      }
      const { raw, width, height } = await decodeHeicToRaw(buf)
      // libheif 解码时已应用旋转变换；相机/相册 HEIC 无透明
      out = await encode(sharp(raw, { raw: { width, height, channels: 4 } }), false)
    }
    const mime = out.mime

    sendJson(res, 200, {
      code: '0',
      message: '',
      data: {
        dataUrl: `data:${mime};base64,${out.data.toString('base64')}`,
        mime,
        width: out.info.width,
        height: out.info.height,
        bytes: out.data.length,
      },
    })
  } catch (err) {
    if (err instanceof CutoutError) {
      sendJson(res, 400, { code: 'BAD_INPUT', message: err.message })
      return
    }
    console.error('[image-ingest]', err)
    sendJson(res, 400, { code: 'BAD_INPUT', message: err.message || '图片处理失败' })
  }
}

module.exports = { handleImageIngest }
