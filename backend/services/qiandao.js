// 千岛开放平台【对外 OpenAPI】客户端（服务端专用）。
// 用法依据 qdmp api-guide（Swagger: g.echo.tech/openapi/auth · /openapi/library）：
//   - POST /auth/v1/token   body { appId, appSecret, grantType, code? }
//     → data { accessToken, expiresAt(秒级时间戳), refreshToken, openId }
//   - POST /auth/v1/refresh body { refreshToken } → data { accessToken, expiresAt }
//   - Library 业务接口（/spu/v1/*）线上用 `Authorization: Bearer <token>`；
//     401 时按文档降级重试 `access-token` + `x-echo-qdmp-version` 头。
//   - Library 响应壳 code 为 **string**（"0" 成功）；Auth 的 code 为数字。两处都兼容。
// appSecret 只允许出现在这里（环境变量 / qdmp.json），绝不进前端。
const fs = require('fs')
const path = require('path')

const OPENAPI_BASE = (process.env.QD_OPENAPI_BASE || 'https://openapi.qiandao.com').replace(/\/+$/, '')
const QDMP_VERSION = process.env.QD_QDMP_VERSION || '1.0'
// 过期前 5 分钟主动刷新（expiresAt 是秒级时间戳）
const REFRESH_THRESHOLD_SEC = 300

// 凭证：环境变量优先（部署环境）；本地开发兜底读项目根 qdmp.json（平台约定该文件
// 可含 appSecret；本仓库的 qdmp.json 目前只有 appId，secret 建议放 backend/.env.local）。
function readQdmpJson() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'qdmp.json'), 'utf8')
    return JSON.parse(raw)
  } catch (_) {
    return {}
  }
}

function credentials() {
  const qdmp = readQdmpJson()
  return {
    appId: process.env.QD_APP_ID || qdmp.appId || '',
    appSecret: process.env.QD_APP_SECRET || qdmp.appSecret || '',
    // api-guide 里 token 请求体的 code 字段标注必填，但 CLIENT_CREDENTIALS 模式官方示例
    // 不带 code；平台若约定了测试取值，通过 QD_AUTH_CODE 传入，否则不发送该字段。
    authCode: process.env.QD_AUTH_CODE || '',
  }
}

class ConfigError extends Error {}
class UpstreamError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

// ─── token 缓存（进程内存；单实例部署足够，多副本各自换票也无冲突） ───
let tokenState = { accessToken: '', refreshToken: '', expiresAt: 0 }
let tokenInFlight = null

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function fetchNewToken() {
  const { appId, appSecret, authCode } = credentials()
  if (!appId || !appSecret) {
    throw new ConfigError('appSecret 未配置：设置环境变量 QD_APP_SECRET（本地可放 backend/.env.local），或在 qdmp.json 补充 appSecret')
  }
  const body = { appId, appSecret, grantType: 'CLIENT_CREDENTIALS' }
  if (authCode) body.code = authCode
  const { status, json } = await postJson(`${OPENAPI_BASE}/auth/v1/token`, body)
  if (String(json.code) !== '0' || !json.data || !json.data.accessToken) {
    // 10001 app_id 无效 / 10002 密钥不匹配 / 10003 授权码错误 / 10004 认证类型不支持
    throw new UpstreamError(`换取 token 失败：${json.message || `HTTP ${status}`}（code ${json.code}）`, status, json)
  }
  tokenState = {
    accessToken: json.data.accessToken,
    refreshToken: json.data.refreshToken || '',
    expiresAt: Number(json.data.expiresAt) || nowSec() + 3600,
  }
  console.log('[qiandao] token acquired, expiresAt =', tokenState.expiresAt)
  return tokenState.accessToken
}

async function refreshToken() {
  const { status, json } = await postJson(`${OPENAPI_BASE}/auth/v1/refresh`, { refreshToken: tokenState.refreshToken })
  // 10007 refreshToken 无效 / 10008 已过期 → 直接重新换票
  if (String(json.code) !== '0' || !json.data || !json.data.accessToken) {
    throw new UpstreamError(`刷新 token 失败：${json.message || `HTTP ${status}`}（code ${json.code}）`, status, json)
  }
  // 刷新接口不返回新的 refreshToken，保留原有的
  tokenState.accessToken = json.data.accessToken
  tokenState.expiresAt = Number(json.data.expiresAt) || nowSec() + 3600
  return tokenState.accessToken
}

async function getValidToken(forceNew = false) {
  if (tokenInFlight) return tokenInFlight
  const run = async () => {
    if (forceNew) return fetchNewToken()
    if (!tokenState.accessToken) return fetchNewToken()
    if (tokenState.expiresAt - nowSec() >= REFRESH_THRESHOLD_SEC) return tokenState.accessToken
    if (tokenState.refreshToken) {
      try {
        return await refreshToken()
      } catch (err) {
        console.warn('[qiandao] refresh failed, re-acquiring:', err.message)
      }
    }
    return fetchNewToken()
  }
  tokenInFlight = run().finally(() => { tokenInFlight = null })
  return tokenInFlight
}

// ─── Library 业务 GET（自动带票 + 401 降级/重试） ───
async function libraryGet(pathWithQuery) {
  let token = await getValidToken()
  const url = `${OPENAPI_BASE}${pathWithQuery}`
  const attempt = (headers) => fetch(url, { headers: { accept: 'application/json', ...headers } })

  // 1) 线上一致的 Bearer 头
  let res = await attempt({ Authorization: `Bearer ${token}` })
  // 2) 401 → 强制换新票再试一次（token 可能被吊销/过期早于 expiresAt）
  if (res.status === 401) {
    token = await getValidToken(true)
    res = await attempt({ Authorization: `Bearer ${token}` })
  }
  // 3) 仍 401 → 按 api-guide 降级为 access-token + x-echo-qdmp-version 头
  if (res.status === 401) {
    res = await attempt({ 'access-token': token, 'x-echo-qdmp-version': QDMP_VERSION })
  }
  const text = await res.text()
  return { status: res.status, body: text }
}

// ─── 图片代理（防盗链/CORS）：只允许千岛系 CDN，防开放代理/SSRF ───
// QD_IMAGE_HOSTS 可追加精确主机名（逗号分隔），用于新 CDN 域名或本地 stub 联调。
const IMAGE_HOST_ALLOW = [/\.qiandaocdn\.com$/i, /\.qiandao\.com$/i, /\.echolab\.cloud$/i]
const IMAGE_HOST_EXTRA = (process.env.QD_IMAGE_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

function normalizeImageUrl(urlString) {
  const prefix = 'echotechoss://user-treasure-v2.image/'
  if (urlString.startsWith(prefix)) {
    return `https://treasure.qiandaocdn.com/treasure/images/${urlString.slice(prefix.length)}`
  }
  return urlString
}

function imageHostAllowed(urlString) {
  try {
    const u = new URL(normalizeImageUrl(urlString))
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (IMAGE_HOST_EXTRA.includes(u.hostname.toLowerCase())) return true
    return IMAGE_HOST_ALLOW.some((re) => re.test(u.hostname))
  } catch (_) {
    return false
  }
}

async function fetchImage(urlString) {
  // 服务端请求天然不带 Referer/Origin → 绕开防盗链；redirect 交给 fetch 默认 follow
  const res = await fetch(normalizeImageUrl(urlString), { headers: { accept: 'image/*' } })
  if (!res.ok) throw new UpstreamError(`图片上游返回 HTTP ${res.status}`, res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  return { contentType: res.headers.get('content-type') || 'application/octet-stream', buf }
}

module.exports = { libraryGet, fetchImage, imageHostAllowed, ConfigError, UpstreamError, OPENAPI_BASE, normalizeImageUrl }
