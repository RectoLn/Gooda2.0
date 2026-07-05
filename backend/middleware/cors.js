// qdmp 本地测试环境约定：所有响应带 CORS 头（H5 dev 从 localhost:100xx 跨端口调用）。
function corsMiddleware(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, access-token, X-Client-Package-Id, X-Request-Package-Id')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }
  return false
}

module.exports = { corsMiddleware }
