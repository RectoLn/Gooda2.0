#!/usr/bin/env bash
# Rebuild our app (qdmp/EMP compile) and deploy it into the local Dimina web
# runtime container so we can test in the REAL Dimina runtime (headless).
# Prereq: Dimina fe/ runtime set up at $DIMINA and dev server running (pnpm dev).
set -euo pipefail
# Overridable via env; defaults match the local dev setup.
QC="${QDMP_CLI:-$(command -v qdmp-cli || echo /Users/rectoln/.npm/_npx/47dcb72a7e5c910c/node_modules/.bin/qdmp-cli)}"
DIMINA="${DIMINA:-/tmp/echo-dimina/fe}"
APP="${DIMINA_APP:-goodatest0001}"
NOPROXY=(env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy)
cd "$(dirname "$0")/.."

echo "==> weapp build + EMP compile + prune (build-native.sh)"
bash scripts/build-native.sh >/dev/null

echo "==> deploy bundle into Dimina container public/$APP/main"
PUB="$DIMINA/packages/container/public"
rm -rf "$PUB/$APP/main"
mkdir -p "$PUB/$APP/main"
cp -R dist/main/. "$PUB/$APP/main/"
echo '[{"appId":"goodatest0001","name":"谷搭","path":"pages/index/index","version":"1.0.0"}]' > "$PUB/appList.json"
echo "==> done. logic.js: $(du -h "$PUB/$APP/main/logic.js" | cut -f1). Reload http://localhost:5173/"
