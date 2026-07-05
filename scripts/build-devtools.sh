#!/usr/bin/env bash
# 千岛开发者工具普通编译产物
# 只生成 Taro weapp dist，不执行 qdmp-cli build；否则 dist 会被 EMP 产物覆盖，
# 开发者工具普通编译会找不到 app.json。
set -euo pipefail

NOPROXY=(env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy)

cd "$(dirname "$0")/.."

echo "==> 清理 dist"
rm -rf dist

echo "==> 生成开发者工具可打开的 Taro dist"
"${NOPROXY[@]}" npm run build

if [ ! -f dist/app.json ]; then
  echo "ERROR: dist/app.json 不存在，开发者工具普通编译会失败" >&2
  exit 1
fi

echo "==> 开发者工具兼容补丁：普通编译不支持 canvas，导出画布降级为 view"
python3 - <<'PY'
from pathlib import Path

path = Path("dist/base.wxml")
text = path.read_text()
text = text.replace(
    '<canvas canvas-id="{{i.p0}}" disable-scroll="{{xs.b(i.p1,!1)}}" binderror="eh" bindtouchstart="eh" bindtouchmove="eh" bindtouchend="eh" bindtouchcancel="eh" bindlongtap="eh" type="{{i.p2}}" style="{{i.st}}" class="{{i.cl}}" bindtap="eh"  id="{{i.uid||i.sid}}" data-sid="{{i.sid}}">',
    '<view style="{{i.st}}" class="{{i.cl}}" bindtap="eh" id="{{i.uid||i.sid}}" data-sid="{{i.sid}}">',
)
text = text.replace("</canvas>", "</view>")
path.write_text(text)
PY

echo "==> 完成。请在千岛开发者工具打开项目根目录：$(pwd)"
echo "==> project.config.json 会指向 ./dist；不要打开 dist/main，也不要先跑 scripts/build-native.sh"
