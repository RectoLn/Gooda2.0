# 谷搭编辑器后端

qdmp 平台约定的 Node.js 后端（runtime `nodejs22`，入口 `index.js`，监听 `:8080`）。两块职责：

1. **SPU 代理**（零依赖）：在服务端持有 appSecret 换取/刷新 access token，把编辑器的谷子（SPU）
   查询转发到千岛开放平台【对外 OpenAPI】。**不接内部接口（/treasure/* 等一律不碰）。**
2. **抠图 /cutout**（onnxruntime-node + sharp）：导入页「智能识别」的自托管抠图推理，
   模型与许可证见 `models-onnx/README.md`。**隐私**：用户照片只进本服务、内存中处理，
   不落盘、不写日志、不外传任何第三方。

## 抠图（/cutout/v1/*）

| 路由 | 说明 |
| ---- | ---- |
| `POST /cutout/v1/remove` | body `{ image: base64（可带 data URL 前缀，≤10MB）}` → `data { image: 透明PNG base64, mime, width, height, bbox, metrics: { fillRatio, aspect }, model, durationMs }`。业务失败 200 + `code: NO_SUBJECT`；`BUSY`/`UNAVAILABLE` 503、`TIMEOUT` 504、`BAD_INPUT` 400/413 |
| `GET /cutout/v1/health?warm=1` | 依赖/模型状态与推理统计；`warm=1` 触发主模型预加载（部署后先打一次） |

实现要点：ISNet(int8, 1024²) 主模型，失败自动降级 u2netp(320²)；串行推理队列（防 OOM，
排队上限 4）；连通域選主（面积×居中加权）+ 4% 留白 bbox 裁切；输出限 1280px。
推理运行时两级：onnxruntime-node 原生（本机实测 1024² ~0.9s）→ **qdmp 线上容器是
musl/Alpine 装不了 glibc 原生二进制，自动落 onnxruntime-web 纯 WASM**（health 的 `runtime`
字段区分 native/wasm；`CUTOUT_FORCE_WASM=1` 可本地复现线上路径）。线上容器 ~1 vCPU 共享，
实测 1024²@4线程 20s+ 必超时，wasm 默认自动压到 **512²@1线程（~3.5-5s，随邻居负载波动）**；
`GET /cutout/v1/health?size=&threads=&warm=1` 可在线调参试验（重启后回默认）。

**⚠️ package-lock.json 手术（勿被 npm install 复原）**：onnxruntime-node 的 postinstall
只为下载 CUDA EP（CPU 二进制已内置），但它在 qdmp 流水线里访问外网失败会打挂 `npm ci`，
且自动生成的 Dockerfile 无法带 .npmrc/环境变量跳过 → 已手动移除 lock 里 onnxruntime-node
条目的 `"hasInstallScript": true`，npm ci 便不执行其脚本。**任何 `npm install` 都会把这个
标记加回来**，发版前需确认（`grep -c hasInstallScript package-lock.json` 应为 1，即只剩 sharp）。
环境变量：`CUTOUT_INPUT_SIZE`(默认1024，内存/耗时不达标可降 768/512)、`CUTOUT_THREADS`(默认4)、
`CUTOUT_TIMEOUT_MS`(默认25000)。本机实测（M 系）：单张 ~0.9s；原生依赖装不上时 /cutout 返回
503 但不影响 /spu/*。

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
