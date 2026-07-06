# Gooda 设计系统 mockup（Claude Design 源）

给 [Claude Design](https://claude.ai/design)（`/design-sync` + DesignSync 工具）用的 **HTML+CSS 组件库源**。
注意：Claude Design 不产出 Taro/Vue/weapp 代码——它是「视觉规范/组件库」层。流程是：
**在这里/在 Design 面板迭代视觉 → 手工把 token 和皮肤搬回 `src/styles/gooda-theme.css` 与各 `.vue`**。

- `foundation.html` — 设计 tokens 底座（配色/字阶/圆角/阴影/间距），源自 `src/styles/gooda-theme.css`。
- `spu-card.html` — SPU 资料库卡片：「现状 vs 精修」对比，含默认/已入池/无图/透明图/导入中各态。

每个文件首行有 `<!-- @dsCard group="..." -->` 标记，Design 面板据此建卡片索引。

## 推到 Claude Design

1. 先授权：跑 `/design-login`（或 `/login` 选带订阅的 Claude 账号）。
2. 让 Claude 走 DesignSync：`list_projects` →（无则）`create_project` → `finalize_plan`（localDir 指向本目录）→ `write_files`。

## 搬回代码时守住的硬约束（都是踩坑换来的）

- 单位 rpx/`PX`（不是 px）；`backdrop-filter` 是性能坑；自绘滚动的素材网格别重引 `scroll-view`；别用受控输入（拼音失焦）。
- WYSIWYG 裁剪不变量、抽屉三态 translateY 位移、手势按时长消歧、canvas 导出 quirk 都是**行为层**——只重设计它们周围的视觉。
- 视觉改动用 H5 构建 + `scripts/verify-*.cjs` 截图验证；canvas/滚动以 Dimina 真机为准。

## 已落地

`spu-card.html` 的「精修」已搬回 `gooda-theme.css` 的 `.spu-card*`（纯视觉，结构/行为不变）：
图片柔和圆角框、"透明图"实心绿标、"导入"实心蓝胶囊主行动、"已入池"绿✓态。千岛 v69。
