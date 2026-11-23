#!/usr/bin/env bash
# 生成自签 TLS 证书（仅用于本地演示 / 内网）
# 用法：bash scripts/gen-cert.sh  或  npm run cert
# 产物：deploy/nginx/certs/server.crt / server.key
# 注意：certs/ 已在 .gitignore 中，私钥绝不入库。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/deploy/nginx/certs"
CRT="$CERT_DIR/server.crt"
KEY="$CERT_DIR/server.key"

if ! command -v openssl >/dev/null 2>&1; then
  echo "错误：找不到 openssl。请安装 openssl 后重试。" >&2
  echo "  或用 Docker 生成：" >&2
  echo "  docker run --rm -v \"$CERT_DIR:/certs\" alpine/openssl req -x509 -nodes -newkey rsa:2048 \\" >&2
  echo "    -keyout /certs/server.key -out /certs/server.crt -days 365 -subj '/CN=localhost'" >&2
  exit 1
fi

mkdir -p "$CERT_DIR"

if [ -f "$CRT" ] && [ -f "$KEY" ]; then
  echo "证书已存在，跳过生成："
  echo "  $CRT"
  echo "  $KEY"
  echo "如需重新生成，请先删除上述两个文件。"
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$KEY" -out "$CRT" -days 365 \
  -subj '/C=CN/ST=Local/L=Local/O=Sangzi Dev/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'

echo "证书已生成："
echo "  $CRT"
echo "  $KEY"
echo
echo "提示：这是自签证书，浏览器会警告'不安全'，属预期行为。"
