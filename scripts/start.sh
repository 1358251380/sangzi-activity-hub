# 一键启动（bash / macOS / Linux / Git Bash）
# 与 scripts/start.ps1 等价
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f web/dist/index.html ]; then
  echo "==> 构建前端"
  npm --prefix web run build
else
  echo "==> 前端产物已存在，跳过构建"
fi

echo "==> 准备示例数据"
node server/src/seed.js

echo "==> 启动服务（生产模式，单端口 3001）"
export NODE_ENV=production
exec node server/src/index.js
