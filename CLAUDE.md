# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`gooda-editor-v2` (谷搭 / "Gooda") is a mobile layer editor for 痛包 / 谷子 layout work, built on **Taro 4.2 + Vue 3 + Vite**, shipping to three targets from one codebase: **H5**, **weapp** (mini-program), and **native Dimina** (via `qdmp` EMP compile). It is the 2.0 migration of `gooda-editor-poc` (1.0) — same framework, different toolchain (webpack→Vite, npm→pnpm) and deploy shape (H5-in-WebView → native Dimina). See [MIGRATION.md](MIGRATION.md) for the full delta and remaining native-parity work.

A companion **backend** (`backend/`) is a separate zero-framework Node service deployed on the qdmp platform: it proxies 千岛 SPU OpenAPI (holding the app secret server-side) and runs self-hosted background-removal (`/cutout`) ONNX inference.

## Commands

Frontend (root):
- `pnpm dev` — H5 watch build (`taro build --type h5 --watch`).
- `pnpm build:h5` — one-shot H5 build into `dist/`.
- `pnpm build` — weapp build (`taro build --type weapp`); precursor to Dimina compile.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm check` — typecheck + H5 build. **Default pre-PR gate.**
- `bash scripts/build-native.sh` — native Dimina build (weapp build → cleans `@dimina/compiler` orphan image copies). Follow with `qdmp-cli upload`. Override CLI path with `QDMP_CLI`.

Backend (`backend/`): `node index.js` (listens `:8080`). Needs `QD_APP_SECRET` (env or `qdmp.json`). See [backend/README.md](backend/README.md).

**Network gotcha:** the shell's `127.0.0.1:7890` proxy is dead. Prefix pnpm/git/qdmp with `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy ...`.

## Verification (no unit-test suite — these scripts are the regression coverage)

Each needs a fresh `pnpm build:h5` first. They drive headless H5 via the `window.__gooda` test hook.
- `node scripts/verify-crop.cjs` — crop WYSIWYG + edit round-trip. Run after any crop change.
- `node scripts/verify-gestures.cjs` — drag + rotate math (mouse path; shares math with touch).
- `node scripts/verify-render.cjs` — render against a running H5 URL.
- `node scripts/verify-cutout.cjs` / `verify-shelf.cjs` — cutout / material shelf.
- **Real Dimina runtime** (the actual target — H5 behaves differently): `pnpm dev` (Dimina fe server) → `bash scripts/dimina-redeploy.sh` → `node scripts/dimina-test.cjs`. Override paths via `QDMP_CLI`, `DIMINA`, `PUPPETEER_DIR`, `DIMINA_URL`.

Touch precision and the crop *visual* on Dimina are **manual device checks** — the native image picker can't be driven headlessly and the `__gooda` hook is absent under Dimina's logic/render split.

## Architecture

### The editor page (`src/pages/index/`) is the whole app

`index.vue` (~3000 lines) is the single orchestrator: it owns **all** editor state, selection, undo/redo history, layer/drawer gestures, storage, and export. The surrounding `.ts` modules and `components/` are deliberately split by *maintenance boundary, not visual size*:

- `editor-core.ts` — side-effect-free data/types/constants + pure math (`boundedScale`, `normalizeRotation`, crop-preview sizing `cropInnerStyle`/`cropBoxFitPx`). Static material/board/bag catalogs live here.
- `image-measure.ts` — pure byte parsing of image dims (PNG IHDR / JPEG SOF + EXIF). No DOM/Taro. The measurement *orchestration* stays in `index.vue` (it's timing/DOM-bound).
- `editor-export.ts` — cross-end canvas export composition.
- `crop-math.ts` — pure crop geometry (`normalizeCropRect`/`denormalizeCropRect`/`cropImageFrame`).
- `components/*.vue` — **presentational only: props in, events out.** All business mutations (add/remove/duplicate/mirror/lock/reorder/save/undo/redo/export) stay centralized in `index.vue`.

Read [src/pages/index/README.md](src/pages/index/README.md) before touching this page — it documents the file map and non-obvious invariants.

### Cross-end discipline (why this codebase looks defensive)

Every DOM/platform touch must survive weapp + Dimina where there is no `window`/`document`. Patterns already in place, do not remove:
- `src/platform/measure.ts` `measureRect()` wraps `Taro.createSelectorQuery` for cross-end rect measurement; `viewportSize()` branches on `process.env.TARO_ENV`.
- IndexedDB, mouse-drag fallbacks, `cropImportImage` etc. are guarded with `process.env.TARO_ENV === 'h5'` / `typeof window|document` and degrade gracefully natively.
- `src/services/storage/kv-store.ts` — IndexedDB blob store (H5 only; native falls back to inline Taro storage) so large asset/export data URLs stay out of the sync storage quota.
- `src/app.js` contains a **Dimina white-screen guard** (`patchDiminaSetupState`) and on-device error modal — **do not delete** (dev builds only for the modal).
- **`Taro.showActionSheet` silently no-ops on the Dimina 安卓/鸿蒙 runtime** (the tap fires, but no sheet appears; iOS works) — do not use it. Use the reusable in-DOM **`components/ActionSheet.vue`** (`:open` / `title` / `:items` → `@select(index)` / `@close`); `AssetActionSheet.vue` is a thin semantic wrapper over it. Styling reuses the shared `.asset-action-*` classes in `styles/gooda-theme.css`. Bonus: invoking `Taro.chooseImage` from an in-DOM row `@tap` stays inside the user-gesture stack (native picker requirement), which the async `showActionSheet` `success` callback can lose.

### Import-crop (WYSIWYG) invariants — do not regress

- Preview and stored asset must render the **exact same source string** (both go through a data URL up front) — different strings decode differently on Dimina.
- Editing an existing asset must `await refreshImportCropStage` before seeding the stored crop; `confirmImportEditor` is gated on `importReady` (a dangling `.then()` here previously let an early save clobber the crop).
- Stored `crop` is normalized 0–1 against `importCropImageFrame()`; identical frame math must be used for seeding and `computeImportCropRect()`.
- Material-shelf crop cards use the **px branch** of `cropInnerStyle` (`cropBoxFitPx`), not percentages — percentage sizing on a nested `<image>` does not resolve on the Dimina renderer.

### 千岛 (Qiandao) integration boundary

- `src/services/qiandao/client.ts` — frontend SPU search/detail/image-proxy calls; talks to the backend (`TARO_APP_SPU_PROXY_BASE`), never directly to OpenAPI. `mock.ts` gated by `TARO_APP_SPU_MOCK`.
- **App secrets and token exchange never live in the page or frontend** — they belong in `backend/`. Add the backend boundary before wiring any private OpenAPI call.
- Backend `/cutout` = self-hosted ISNet(int8)→u2netp ONNX background removal; runs native onnxruntime locally but falls back to **onnxruntime-web WASM** on the musl/Alpine qdmp container. User photos are memory-only (never persisted/logged/forwarded).
- **Backend `package-lock.json` surgery:** onnxruntime-node's `"hasInstallScript": true` is manually removed so `npm ci` doesn't hit the network in the qdmp pipeline. Any `npm install` re-adds it — verify `grep -c hasInstallScript backend/package-lock.json` is `1` (sharp only) before release.

## Conventions

- pnpm for deps; package scripts internally call `npm run`. First install: `pnpm install --config.manage-package-manager-versions=false`.
- `.editorconfig`: 2-space indent, UTF-8, final newline. ESLint `taro/vue3`, Stylelint `stylelint-config-standard`.
- PascalCase Vue components, kebab-case CSS classes, descriptive `.ts` helper names.
- Conventional Commits (Commitlint enforced), e.g. `fix: preserve crop preview geometry`.
- Shared editor visual tokens (water-blue / iOS-glass) live in `src/styles/gooda-theme.css` — prefer adding tokens there over one-off styles. Design spec: [docs/design.md](docs/design.md).
- Images are intentionally base64-inlined in mini/Dimina builds (relative `<image>` paths 404 there); assets are pre-downsampled to keep inline size sane.
