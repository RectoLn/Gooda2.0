// SPU 代理路由：对外 OpenAPI（Library 网关）纯转发 + 图片代理。
// 响应壳与上游一致（code 为字符串 "0"），前端 HttpQiandaoSpuClient 直接消费。
const { libraryGet, fetchImage, imageHostAllowed, ConfigError, UpstreamError } = require('../services/qiandao')

// Library 分页硬约束：offset + limit ≤ 100（超出会被上游拒绝，这里先钳制）
const PAGE_WINDOW_MAX = 100

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function sendError(res, err) {
  if (err instanceof ConfigError) {
    sendJson(res, 503, { code: '-1', message: `SPU 服务未就绪：${err.message}` })
    return
  }
  if (err instanceof UpstreamError) {
    sendJson(res, 502, { code: '-1', message: err.message })
    return
  }
  console.error('[spu-proxy]', err)
  sendJson(res, 500, { code: '-1', message: 'SPU 代理内部错误' })
}

function passthrough(res, upstream) {
  // 上游正常应答（含业务错误码）原样透传，让前端统一按响应壳处理
  res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
  res.end(upstream.body)
}

async function handleSpuSearch(req, res, query) {
  const offset = Math.max(0, parseInt(query.offset, 10) || 0)
  let limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20))
  if (offset >= PAGE_WINDOW_MAX) {
    // 上游窗口之外：返回空页而不是让上游报错
    sendJson(res, 200, { code: '0', message: '', data: { items: [], totalCount: String(PAGE_WINDOW_MAX) } })
    return
  }
  if (offset + limit > PAGE_WINDOW_MAX) limit = PAGE_WINDOW_MAX - offset

  const params = new URLSearchParams()
  if (query.keyword) params.set('keyword', String(query.keyword))
  if (query.ipTag) params.set('ipTag', String(query.ipTag))
  if (query.typeId) params.set('typeId', String(query.typeId))
  params.set('offset', String(offset))
  params.set('limit', String(limit))

  try {
    passthrough(res, await libraryGet(`/spu/v1/search?${params.toString()}`))
  } catch (err) {
    sendError(res, err)
  }
}

async function handleSpuDetail(req, res, query) {
  const id = String(query.id || '').trim()
  if (!id) {
    sendJson(res, 400, { code: '-1', message: '缺少 id 参数' })
    return
  }
  try {
    passthrough(res, await libraryGet(`/spu/v1/detail?id=${encodeURIComponent(id)}`))
  } catch (err) {
    sendError(res, err)
  }
}

async function handleSpuImage(req, res, query) {
  const target = String(query.url || '')
  if (!imageHostAllowed(target)) {
    sendJson(res, 400, { code: '-1', message: '仅允许代理千岛 CDN 图片' })
    return
  }
  try {
    const { contentType, buf } = await fetchImage(target)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400',
    })
    res.end(buf)
  } catch (err) {
    sendError(res, err)
  }
}

module.exports = { handleSpuSearch, handleSpuDetail, handleSpuImage }
