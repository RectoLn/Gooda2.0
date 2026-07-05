# Qiandao Frontend Boundary

This folder is prepared for Qiandao-native and Qiandao OpenAPI integration from the frontend side.

## Safe Here

- Typed request wrappers for public or backend-proxied Gooda APIs.
- SPU search UI adapters that call a Gooda backend.
- SDK wrappers for Qiandao native abilities available inside the app WebView.
- Types shared by editor UI and future SPU search UI.

## Not Safe Here

- App secrets.
- Client-credentials token exchange.
- Authorization-code exchange that requires a secret.
- Private OpenAPI calls made directly from the user's device.
- 千岛内部（非开放平台）接口 —— 一律只走对外 OpenAPI，经 Gooda 后端代理转发。

## Current Status

SPU 资料库导入已接线（`client.ts` + `types.ts` + 编辑器的 SpuSearchPanel）：

- `resolveQiandaoSpuService()` 按构建配置选择实现：
  - `TARO_APP_SPU_PROXY_BASE` 已设置 → `HttpQiandaoSpuClient`（真实后端代理）。
  - 未设置 + H5 dev（或 `TARO_APP_SPU_MOCK=1`）→ `mock.ts` 演示数据，UI 有明确「演示数据」标记。
  - 其余 → unconfigured，UI 显示「资料库服务未配置」。
- `normalizeQiandaoSpu` 做字段容错映射；图片优先级：透明图（whiteBgPng）> 主图。
- 用户账号同步仍未接。

## Backend Proxy Contract（已由 `backend/` 实现）

代理是官方开放平台 OpenAPI 的**纯转发**（服务端 CLIENT_CREDENTIALS 换票 + Bearer 头，
appSecret 只存在于服务端），实现与配置见 `backend/README.md`：

- `GET {TARO_APP_SPU_PROXY_BASE}/spu/v1/search?keyword=&offset=&limit=`
  → `{ code: "0", data: { items: [ librarySpuItem ], totalCount } }`
  （对应 OpenAPI `GET /spu/v1/search`；offset+limit ≤ 100，代理端已钳制）
- `GET {TARO_APP_SPU_PROXY_BASE}/spu/v1/detail?id=`
  → `{ code: "0", data: { spu: { id, name, image, whiteBgPng, typeId, typeName, ... } } }`
  （对应 OpenAPI `GET /spu/v1/detail`）
- `GET {TARO_APP_SPU_PROXY_BASE}/spu/v1/image?url=` 图片代理（防盗链/CORS），仅放行
  千岛系 CDN 域名；`HttpQiandaoSpuClient` 会把 SPU 图片 URL 自动改写到这条路由。
