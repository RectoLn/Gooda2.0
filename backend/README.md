# 谷搭 SPU 代理后端

qdmp 平台约定的 Node.js 后端（runtime `nodejs22`，入口 `index.js`，监听 `:8080`，零依赖）。
唯一职责：在服务端持有 appSecret 换取/刷新 access token，把编辑器的谷子（SPU）查询转发到
千岛开放平台【对外 OpenAPI】。**不接内部接口（/treasure/* 等一律不碰）。**

## 对上游（openapi.qiandao.com，用法依据 qdmp api-guide / Library Swagger）

- `POST /auth/v1/token`：`{ appId, appSecret, grantType: 'CLIENT_CREDENTIALS' }`
  → `data.accessToken / expiresAt(秒) / refreshToken`；过期前 5 分钟自动刷新，刷新失败自动重新换票。
- `GET /spu/v1/search?keyword=&ipTag=&typeId=&offset=&limit=`：**offset+limit ≤ 100**（本服务已钳制）。
- `GET /spu/v1/detail?id=`：`data.spu` 为 `librarySpu`（`id/name/image/whiteBgPng/typeId/typeName/...`）。
- 业务请求头：`Authorization: Bearer <token>`；401 时自动降级重试 `access-token` + `x-echo-qdmp-version`。
- Library 响应壳 `code` 是**字符串** `"0"`；Auth 的 `code` 是数字。均已兼容。

## 对下游（编辑器前端 `src/services/qiandao/client.ts`）

| 路由 | 说明 |
| ---- | ---- |
| `GET /spu/v1/search` | 转发搜索，响应壳原样透传 |
| `GET /spu/v1/detail` | 转发详情 |
| `GET /spu/v1/image?url=` | 图片代理（防盗链/CORS），仅允许千岛系 CDN；详情返回的 `echotechoss://user-treasure-v2.image/...` 会转换到千岛 CDN |
| `GET /` `GET /healthz` | 健康检查 |

## 配置（环境变量优先；qdmp 平台约定不读本地 .env，本地测试用 `.env.local`）

| 变量 | 说明 |
| ---- | ---- |
| `QD_APP_SECRET` | **必填**。开放平台控制台获取；也可写进根目录 `qdmp.json` 的 `appSecret` 字段 |
| `QD_APP_ID` | 默认取根目录 `qdmp.json` 的 `appId` |
| `QD_OPENAPI_BASE` | 默认 `https://openapi.qiandao.com`（本地联调可指向 stub） |
| `QD_AUTH_CODE` | 可选。若平台要求 CLIENT_CREDENTIALS 也带 code 的约定取值 |
| `QD_QDMP_VERSION` | 默认 `1.0`（降级请求头 `x-echo-qdmp-version`） |

## 本地跑

```bash
# backend/.env.local（已被 .gitignore 的 *.local 覆盖，不会提交）
# QD_APP_SECRET=xxx
set -a; source .env.local 2>/dev/null; set +a
node index.js   # → http://localhost:8080
```

前端联调：项目根 `.env.local` 写 `TARO_APP_SPU_PROXY_BASE=http://localhost:8080`，`pnpm dev`。

## 真实联调记录

- `CLIENT_CREDENTIALS` 不需要 `code`；search 返回裸 `librarySpu` 字段。
- `GET /spu/v1/detail` 的 `whiteBgPng` 可能返回 `echotechoss://...`，已在前端 normalize 与后端图片代理两侧做转换兜底。
