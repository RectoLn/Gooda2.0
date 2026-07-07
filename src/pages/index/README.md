# Gooda Editor Page Structure

This page is the MVP mobile layer editor for 痛包 / 谷子 layout work. The current structure is intentionally split by maintenance boundary, not by visual size.

## File Map

- `index.vue`
  - Page orchestrator.
  - Owns editor state, selection, history, layer gestures, drawer gestures, storage, and export.
  - Keep layer behavior changes here unless they are pure data helpers.

- `editor-core.ts`
  - Side-effect-free editor data, types, constants, and canvas helper functions.
  - Good place for catalog data, layer math helpers, export helper primitives, and shared types.
  - Also holds the pure scale/rotation helpers (`boundedScale`, `normalizeRotation`,
    `displayRotation`, `formatScale`, `formatRotation`, `MIN_SCALE`/`MAX_SCALE`) and the
    crop-preview sizing helpers (`cropInnerStyle`, `cropBoxFit`, `cropBoxFitPx`).
  - Domain-model types live here too: `Mat` / `Layer` / `RowItem` plus the local-asset
    types `UserAsset` / `StoredUserAsset` / `StoredExportHistoryRecord`.

- `asset-helpers.ts`
  - Side-effect-free material helpers lifted out of `index.vue` (no reactive-state deps):
    `assetToMat`, `guessAssetShape`, `defaultAssetSize`, `placeholderColor`,
    `categoryPlaceholder`, `importedAssetBox`, `spuAssetLabel`.

- `image-measure.ts`
  - Pure image-dimension parsing from raw bytes (PNG IHDR / JPEG SOF + EXIF orientation),
    plus `normalizeImageSize` / `imageSizeFromFile` / `imageSizeFromDataUrl`.
  - No DOM / Taro deps. The measurement *orchestration* (widthFix probe, getImageInfo,
    filesystem reads) stays in `index.vue` because it is timing/DOM bound — do not move it here.

- `editor-export.ts`
  - Canvas export composition for the cross-end (H5 / mini-program) canvas path.
  - Keep export drawing details here so `index.vue` does not mix canvas composition with touch/editing logic.
  - Also holds the pure export/save utilities: `formatExportHistoryTime`,
    `normalizeExportRecord`, `dataUrlToFile`, `errMsgOf`, `EXPORT_FILE_NAME`.

- `../../services/storage/kv-store.ts`
  - `createKvStore(dbName, storeName)` — one IndexedDB-backed string blob store (H5 only;
    native falls back to inline Taro storage). Used for user-asset images and export-history
    images so large data URLs stay out of the small synchronous storage quota.

- `components/EditorTopbar.vue`
  - Brand, undo / redo, save, export controls.

- `components/StageToolRail.vue`
  - Draggable left-side canvas tool rail: zoom, grid, fit selection, layer drawer.

- `components/SelectionOverlay.vue`
  - Rectangular selected-layer overlay and four corner handles.
  - It only renders the overlay and emits actions; it should not decide selection state.

- `components/NudgeInspector.vue`
  - Scale / rotation micro-adjust capsule.
  - Emits input and step events back to `index.vue` so history commits stay centralized.

- `components/MaterialShelf.vue`
  - Bottom material drawer, big category tabs, subcategory tabs, and material grid.
  - It receives already-filtered `rowItems`; category state remains in `index.vue`.
  - Crop preview cards use a **px box + px branch** of `cropInnerStyle` (via `cropBoxFitPx`),
    identical to the stage layer and drag ghost. Do NOT switch back to the percentage
    branch: percentage width/height/left/top on a nested `<image>` does not resolve on the
    Dimina renderer and shows the wrong region.

- `components/LayerDrawer.vue`
  - Layer list, lock button, reorder drag handles.
  - Reorder math and final layer mutation stay in `index.vue`.

- `components/AssetActionSheet.vue` · `components/ExportHistoryPanel.vue` · `components/ExportPreview.vue`
  - Presentational modal/sheet overlays lifted out of the page template. Props in, events out;
    all state and mutations stay in `index.vue`. Their CSS still lives in `gooda-theme.css`.

- `components/SpuSearchPanel.vue`
  - 千岛资料库（SPU）搜索/导入面板，素材架谷子分类的「资料库」入口打开。
  - Presentational only：搜索关键词、加载/失败/空态、结果与导入状态全部由 `index.vue`
    持有并通过 props 传入；服务请求与字段映射在 `../../services/qiandao/`。
  - 导入链路：透明图（whiteBgPng）→ 整图直接入池；普通主图 → 复用 ImportCropEditor
    确认裁剪（同一 data URL 不变量），confirm 时带 `importDraft.spuId` 写入
    `source: 'spu' + spuId`。

- `../../styles/gooda-theme.css`
  - Shared water-blue / iOS glass visual language for this editor.
  - Prefer adding reusable tokens here before introducing new one-off blues or glass styles.

- `../../services/qiandao/`
  - Future Qiandao integration boundary.
  - SPU search and backend-proxied OpenAPI calls should be introduced there first, then consumed by this page.

## Maintenance Rules

- Do not bind selected handles to `materialCollapsed`; selection follows `selected`, while drag affordances follow `layerDragging`.
- Keep the selected outline as a rectangular overlay. Circular layer content should stay visually circular, but selected state should remain rectangular.
- Keep business mutations centralized in `index.vue`: add, remove, duplicate, mirror, lock, reorder, save, undo, redo, export.
- Components should be mostly presentational: props in, events out.
- Big category tabs can use the expressive wave underline / sparkle style. Subcategory tabs should stay quieter.
- Keep Qiandao app secrets and token exchange out of this page. Add a backend boundary before wiring private OpenAPI calls.

### Import crop (WYSIWYG) invariants — do not regress

- The editor preview and the stored asset must render the exact same image **source string**
  (`openImportEditor` converts to a data URL up front for both). Different source strings can
  decode differently on Dimina and map the same normalized crop to a different region.
- When editing an existing asset, `openImportEditorFromAsset` must `await refreshImportCropStage`
  BEFORE seeding the stored crop, and `confirmImportEditor` is gated on `importReady`. A dangling
  `.then()` here let an early 保存 overwrite the stored crop with the default selection.
- The stored `crop` is normalized (0–1) against `importCropImageFrame()`; the same frame math
  must be used both when seeding and when calling `computeImportCropRect()`, or the crop drifts.

## Verification

- Type + build gate: `npm run check` (= `npm run typecheck` + `npm run build:h5`). Native: `npm run build`.
- Crop WYSIWYG + edit round-trip + import-editor DOM/wiring (headless H5): `node scripts/verify-crop.cjs` (needs a fresh `build:h5`).
- Layer gestures (drag + rotate, mouse path — shares math with touch): `node scripts/verify-gestures.cjs` (needs a fresh `build:h5`). Touch precision itself is a manual device check.
- Undo/redo snapshot round-trip + user-asset persistence hydration (headless H5): `node scripts/verify-state.cjs` (needs a fresh `build:h5`). Guards history-stack corruption and assets vanishing on reload — the two highest-risk stateful paths.
- Real Dimina runtime (the actual target — H5 differs!): start the Dimina `fe` dev server (`pnpm dev`),
  then `bash scripts/dimina-redeploy.sh` and `node scripts/dimina-test.cjs`. Override machine paths with
  `QDMP_CLI`, `DIMINA`, `PUPPETEER_DIR`, `DIMINA_URL` env vars.
- Dimina's logic/render split means the H5 `window.__gooda` test hook is NOT available there, and the
  native image picker can't be driven headlessly → the crop **visual** on Dimina is a manual check
  (import an image, confirm the shelf card matches the placed layer).
