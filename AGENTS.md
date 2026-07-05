# Repository Guidelines

## Project Structure & Module Organization

This is a Taro 4 + Vue 3 mini-program/H5 editor project. Main code lives in `src/`: `app.js`, `app.config.js`, and `app.scss` define the app shell; `src/pages/index/` contains the Gooda editor page, helpers, and Vue components; `src/styles/gooda-theme.css` holds shared editor styling tokens. Service boundaries live in `src/services/` (`qiandao/`, `storage/`), while older API wrappers are in `src/apis/`. Build config is under `config/`, type declarations under `types/`, and regression/packaging utilities under `scripts/`.

## Build, Test, and Development Commands

Use pnpm for dependency management (`pnpm install`); package scripts currently call `npm run` internally.

- `pnpm dev`: builds H5 in watch mode via `taro build --type h5 --watch`.
- `pnpm build`: builds the weapp target into `dist/`.
- `pnpm build:h5`: creates an H5 build in `dist/`.
- `pnpm typecheck`: runs `tsc --noEmit`.
- `pnpm check`: runs typecheck plus H5 build; use this as the default pre-PR gate.
- `pnpm upload`: builds, runs `qdmp build`, then uploads.
- `bash scripts/build-native.sh`: native Dimina build path; supports `QDMP_CLI`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, spaces, 2-space indentation, final newline, and trimmed trailing whitespace except Markdown. ESLint extends `taro/vue3`; Stylelint extends `stylelint-config-standard`. Use PascalCase for Vue components (`EditorTopbar.vue`), kebab-case for CSS classes, and descriptive helper filenames such as `crop-math.ts`. Keep page state and mutations centralized in `src/pages/index/index.vue`; move pure math, rendering, and data helpers into adjacent `.ts` modules.

## Testing Guidelines

There is no conventional unit test suite yet. Use the existing script checks as regression coverage:

- `node scripts/verify-crop.cjs` after `pnpm build:h5`.
- `node scripts/verify-gestures.cjs` after `pnpm build:h5`.
- `node scripts/verify-render.cjs` against a running H5 URL.
- `node scripts/dimina-test.cjs` after Dimina redeploy for the real target runtime.

When changing crop, gesture, export, or Dimina behavior, run the relevant script and note manual device checks.

## Commit & Pull Request Guidelines

The repo includes Commitlint with `@commitlint/config-conventional`; use Conventional Commit subjects such as `fix: preserve crop preview geometry` or `feat: add export history panel`. Current history is shallow, so prefer clear, scoped messages over relying on prior examples. PRs should include a concise behavior summary, affected runtime (`h5`, `weapp`, or Dimina), verification commands run, screenshots for UI changes, and linked issue/task context when available.

## Security & Configuration Tips

Do not commit app secrets, long-lived tokens, or private OpenAPI credentials. Keep frontend-safe Qiandao adapters in `src/services/qiandao/`; backend-only authorization flows belong outside the page layer.
