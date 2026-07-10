const url = require('url')
const { corsMiddleware } = require('../middleware/cors')
const { handleSpuSearch, handleSpuDetail, handleSpuImage } = require('./spu')
const { handleCutoutRemove, handleCutoutHealth } = require('./cutout')
const { handleImageIngest } = require('./image')

async function handleRequest(req, res) {
  if (corsMiddleware(req, res)) return

  const parsed = url.parse(req.url, true)
  const { pathname, query } = parsed

  if (req.method === 'GET' && pathname === '/spu/v1/search') return handleSpuSearch(req, res, query)
  if (req.method === 'GET' && pathname === '/spu/v1/detail') return handleSpuDetail(req, res, query)
  if (req.method === 'GET' && pathname === '/spu/v1/image') return handleSpuImage(req, res, query)

  if (req.method === 'POST' && pathname === '/cutout/v1/remove') return handleCutoutRemove(req, res)
  if (req.method === 'GET' && pathname === '/cutout/v1/health') return handleCutoutHealth(req, res, query)

  if (req.method === 'POST' && pathname === '/image/v1/ingest') return handleImageIngest(req, res)

  if (pathname === '/' || pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ code: '0', message: 'gooda-editor backend ok', data: { service: 'spu-proxy' } }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ code: '-1', message: 'Not Found' }))
}

module.exports = { handleRequest }
