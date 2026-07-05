// 谷搭 SPU 代理后端 —— qdmp 平台约定：入口 index.js，监听 :8080，Node 22，零依赖。
// 职责：持有 appSecret 在服务端换取/刷新 access token，把编辑器的 SPU 查询转发到
// 开放平台【对外 OpenAPI】(openapi.qiandao.com /spu/v1/*)。不接任何内部接口。
const http = require('http')
const { handleRequest } = require('./routes')

const PORT = 8080

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[gooda-backend] unhandled:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
    }
    res.end(JSON.stringify({ code: '-1', message: 'internal error' }))
  })
})

server.listen(PORT, () => {
  console.log(`gooda-editor backend running on :${PORT}`)
})
