# 谷搭编辑器 · 千岛 SPU 资料库导入（PRD 摘要）

> 由现有实现与 MRD 反向整理（完整产品背景见知识库《谷搭———痛包MRD》）。
> 核心定位：谷子池 + 自主排版 + 千岛交易/SPU 联动；SPU 资料库是相对站外工具的护城河。

## 需求

用户在痛包编辑器内，从千岛官方 SPU 资料库搜索谷子并导入谷子池，与本地导入素材同权使用
（点击加入 / 拖拽上画布 / 长按编辑删除），素材保留 `spuId` 供后续「买同款 / 材料清单」使用。

## 前端（已实现，src/pages/index + src/services/qiandao）

- 素材架「谷子」分类 →「资料库」入口 → SpuSearchPanel（搜索/空态/加载/失败态）。
- 导入：透明图（whiteBgPng）整图直接入池；仅主图时进 ImportCropEditor 确认裁剪。
- 资产写 `source:'spu' + spuId`，持久化（localStorage + IndexedDB）与画布图层全程保留。
- 同 spuId 重复导入需确认（再导一份 / 去查看），不静默重复。
- 服务三态：proxy（已配 `TARO_APP_SPU_PROXY_BASE`）/ mock（仅 H5 dev）/ unconfigured（明确提示）。

## 后端（backend/，qdmp Node.js 22 约定）

- 只转发对外 OpenAPI：`GET /spu/v1/search`、`GET /spu/v1/detail`（Bearer token，
  服务端 CLIENT_CREDENTIALS 换票 + 缓存刷新；offset+limit ≤ 100 钳制）。
- `GET /spu/v1/image?url=` 图片代理（防盗链/CORS），仅允许千岛系 CDN 域名。
- appSecret 仅存在于服务端（env `QD_APP_SECRET` / qdmp.json），绝不进前端。
- **禁止**使用内部接口（/treasure/*、/flora/*、/gactus/* 等）。

## 待办 / 依赖

- [x] open.qiandao.com 控制台获取 appSecret（谷搭3 / echocoWvNEQuDVoKf1Ct），确认 SPU 接口权限。
- [x] 真实上游联调：确认 search items 为裸 `librarySpu` 字段，CLIENT_CREDENTIALS 不需要 code；
      detail 的 `whiteBgPng` 可能返回 `echotechoss://user-treasure-v2.image/...`，前后端已规范化为 CDN URL。
- [ ] 后端 publish 到 qdmp 平台，前端 `.env` 配置正式 `TARO_APP_SPU_PROXY_BASE` 后发版。
- [ ] 后续：mark/wishspu 打通「买同款」；ipTag/typeId 筛选搜索。
