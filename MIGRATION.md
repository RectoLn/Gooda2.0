# 谷搭 1.0 → 2.0 迁移记录

本项目 `gooda-editor-v2` 是把 `gooda-editor-poc`（1.0）迁移到千岛小程序 2.0 模板的结果。

## 关键结论

**2.0 和 1.0 都是 Taro 4.2 + Vue3，不是换框架。** 差异在工具链和部署形态：

| 维度 | 1.0 (gooda-editor-poc) | 2.0 (本项目) |
|---|---|---|
| 编译器 | webpack5 | **Vite**（`config/index.js` `compiler: 'vite'`）|
| 包管理 | npm | **pnpm** |
| 目录 | 扁平 | 2.0 模板结构 + `src/apis`（鉴权/网关层）|
| 部署形态 | H5 塞进 WebView | **原生 Dimina 小程序**（weapp 构建 → `qdmp build` EMP 编译）|
| qdmp.json | `{appId}` | `{appId, loader: "EMP"}` |
| 语言 | TypeScript | 模板是 JS，本项目**保留 TypeScript**（Taro+Vite 原生支持）|

## 已完成 ✅

1. 从 `EchoTechFE/qdmp-taro-template`（2.0 默认模板）克隆骨架。
2. 迁入全部源码（保留 TS）：`src/pages/index`（含 components、editor-core.ts、editor-export.ts）、`src/styles`、`src/services`、`src/assets`、`tsconfig.json`、`types/`。
3. 保留模板的 2.0 资产：`src/apis/`（auth/request/spu 网关层）、`src/app.js`（含 Dimina 防白屏 guard，**勿删**）。
4. 适配 `config/index.js`：projectName、Vite、H5 `publicPath './'`、10086 端口。
5. **三种构建全部通过**：
   - `npm run build:h5` → H5，无头渲染验证与 1.0 **像素级一致**。
   - `npm run build`（`taro build --type weapp`）→ 小程序格式（.wxml/.wxss/.json/.js）。
   - `qdmp-cli build` → **Dimina/EMP 编译成功**，`@dimina/compiler` 随 CLI 提供。
6. 原生运行加固：`viewportSize()` 改为按 `process.env.TARO_ENV` 分支（原生用 `Taro.getSystemInfoSync`，H5 用 `window.innerWidth`）。
7. 确认 1.0 代码本就大量做了跨端 guard：IndexedDB、`cropImportImage`、鼠标拖拽 fallback 都已用 `process.env.TARO_ENV === 'h5'` / `typeof window|document` 包裹 → 原生下不会崩，优雅降级。

## 构建 / 部署命令

```bash
# 装依赖（首次）
pnpm install --config.manage-package-manager-versions=false

# H5 预览 / 部署（沿用 1.0 路径，需先把 qdmp.json 的 loader 去掉）
npm run build:h5           # 产物 dist/，index.html 用 ./js 相对路径

# 原生小程序（2.0 主推）
npm run build              # taro build --type weapp
qdmp-cli build            # Dimina/EMP 编译
qdmp-cli upload           # 上传（loader: EMP）
# 或开发者工具导入 dist/ 预览：https://dev.qiandao.com/miniapp-docs/guide/devtools-releases/
```

> ⚠️ 网络：环境里配置的代理 127.0.0.1:7890 是死的。跑 pnpm/git/qdmp 时用 `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy ...` 清掉代理再执行。

## 剩余原生化工作（需要千岛开发者工具/真机联调）

当前原生下能**跑起来但功能降级**，距离“原生功能对齐 + 可上传”还差三块：

### 0. 平台 App 类型（原生上线的前置门槛）🔴🔴
- 尝试上传原生 Dimina 包被拒：`未找到index.html文件`。原因：`qdmp-cli upload` 按**平台上 App 的 loader** 决定打包方式，不看本地 qdmp.json。
- 实测两个 App 的平台属性（`/mp/v1/lookup/app/<appId>`）：
  - 谷搭 `echo0L1elYGL839Yci2r`、谷搭2 `echotcgN6VXk3shMUXkD` 都是 `type: "EXTERNAL"`, `loader: "SPA"` —— 即**外部 H5 应用**。
- 原生 Dimina 需要 `loader: "EMP"` 的 App，这是**建 App 时的类别**，不是代码能改的。
- **动作**：在千岛后台建一个原生/小程序类别（loader=EMP）的 App 拿新 appId；拿不到就找写这份 2.0 手册的同事确认原生 App 怎么注册。在此之前，原生包无法上传，只能走 H5。

### 1. 资产体积 / 白屏（🟠 优化未落地，需确认）
- **现象**：原生 Dimina 版真机白屏（H5 正常）。
- **根因**：EMP 编译把 6MB 图片 base64 内联进 `main/logic.js` → 8MB，Dimina 运行时加载/解析失败 → 白屏。
- **计划修法（注意：其中 1. 目前并未在 config 里生效）**：
  1. ⚠️ **未落地**：`config/index.js` 加 `mini.imageUrlLoaderOption: { limit: 0 }` 让图片以独立文件发出。**当前 config 没有这一项**，实测 `logic.js` 仍 ~6.7M（图片被内联）。是否加需确认（改构建配置、影响原生包体积/白屏）。语义反常——**truthy 强制内联、`0` 才发文件**，见 `@tarojs/vite-runner/dist/common/vite-plugin-assets.js:73`。
  2. `@dimina/compiler` 有 bug：把每张图复制 ~31 份，但只引用 1 份。用 `scripts/build-native.sh` 在编译后**清理孤儿副本**。
  3. `src/assets` 的原图用 `sips -Z` 下采样过。
- **原生构建统一走**：`bash scripts/build-native.sh` → `qdmp-cli upload`。
- 若要进一步减小主包，可把大图挪到 CDN，把 `editor-core.ts` 的 `import` 改成 https URL。

### 2. 导入图片裁切（✅ 已改为归一化裁剪，跨端生效）
- **现状**：不再用 `document.createElement('canvas')` 裁原图。导入时存**整图 + 归一化 crop**
  （`createImportedAsset`），渲染时用 CSS clip（`cropInnerStyle`），导出时用 `drawCroppedRoundedImage`
  在跨端 canvas 上裁。原生（Dimina）下同样生效。
- 纯几何在 `crop-math.ts`（`cropImageFrame`/`normalizeCropRect`/`denormalizeCropRect`），字节测量在
  `image-measure.ts`。裁剪一致性不变式见 `src/pages/index/README.md`。
- **待人工终验**：Dimina 逻辑/渲染分离 + 原生选图器无法 headless → 裁剪**视觉**需真机导入一张图核对。

### 3. 拖拽/旋转坐标映射（✅ 已走跨端量测）
- `refreshStageRect()` 用 `platform/measure.ts` 的 `measureRect('.stage')`（`Taro.createSelectorQuery`，
  跨端）把 stage 屏幕矩形缓存进 `stageRect`；`onTouchStart` 会刷新，`clientPointToWindowPoint()` /
  `startRotateHandle()` 用缓存值，`stageScreenRect()` 再兜一层 H5 DOM。原生落点/旋转中心应正确。
- **待人工终验**：同上，触摸交互精度需真机确认。

### 其它
- 导出历史大图：原生下 IndexedDB 被跳过，大图不持久化。需要的话改 `Taro.getFileSystemManager()` 存文件。
- `src/apis/auth.js` 的 `APP_ID`/`APP_SECRET` 还是空的；要用后端/OpenAPI 网关时填。
- 若要宿主交互（登录/支付/分享），按手册接 `@frontend/effuse`（本模板未内置该依赖）。

## 验证记录

- H5：`npm run build:h5` → 688 模块，puppeteer 无头加载渲染完整编辑器 UI，与 1.0 一致。
- weapp：`npm run build` → 3-5s 编译通过。
- EMP：`qdmp-cli build` → Dimina 编译通过（仅 wx.cloud 兼容告警 + Taro comp 循环依赖告警，均无害）。
