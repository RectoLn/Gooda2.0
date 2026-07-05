#!/usr/bin/env bash
# 原生 Dimina 构建脚本（谷搭）
# 步骤：清理 → weapp 构建 → EMP 编译 → 清理编译器产生的孤儿图片副本
# 用法：bash scripts/build-native.sh   然后  qdmp-cli upload
set -euo pipefail

# qdmp-cli location: prefer $QDMP_CLI, then PATH, then the npx cache fallback.
QC="${QDMP_CLI:-$(command -v qdmp-cli || echo /Users/rectoln/.npm/_npx/47dcb72a7e5c910c/node_modules/.bin/qdmp-cli)}"
# 环境里配置的代理 127.0.0.1:7890 是死的，全部清掉走直连
NOPROXY=(env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy)

cd "$(dirname "$0")/.."

echo "==> 清理 dist"
rm -rf dist

echo "==> weapp 构建 (taro build --type weapp)"
"${NOPROXY[@]}" npm run build >/dev/null

echo "==> EMP / Dimina 编译 (qdmp-cli build)"
"${NOPROXY[@]}" "$QC" build

echo "==> 清理孤儿图片副本 (EMP 编译器会把每张图复制 ~31 份)"
cd dist
# 收集所有被编译产物真正引用的 hash 文件名
grep -rhoE "[a-z0-9]{5}_[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)" \
  main/logic.js main/pages_index_index.js main/pages_index_index.css main/app.css main/app-config.json 2>/dev/null \
  | sort -u > /tmp/gooda-refs.txt || true
KEEP=$(mktemp -d)
while read -r f; do [ -f "main/static/$f" ] && cp "main/static/$f" "$KEEP/"; done < /tmp/gooda-refs.txt
rm -f main/static/*.png main/static/*.jpg main/static/*.jpeg main/static/*.gif main/static/*.webp 2>/dev/null || true
cp "$KEEP"/* main/static/ 2>/dev/null || true
rm -rf "$KEEP"
cd ..

STATIC_COUNT=0
if [ -d dist/main/static ]; then
  STATIC_COUNT=$(ls dist/main/static/ | wc -l | tr -d ' ')
fi
echo "==> 完成。dist 大小：$(du -sh dist | cut -f1)，logic.js：$(du -h dist/main/logic.js | cut -f1)，图片：${STATIC_COUNT} 个"
echo "==> 上传请执行： $QC upload   (需已 qdmp-cli login)"
