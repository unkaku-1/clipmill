#!/usr/bin/env bash
# ClipMill one-click deployment.
#
#   ./deploy.sh              build the image and start the container (port 8080)
#   CLIPMILL_PORT=9000 ./deploy.sh
#   ./deploy.sh down         stop and remove the container
#   ./deploy.sh logs         follow container logs
#
# Requires Docker (or Docker Desktop / 绿联 NAS Docker). Everything runs locally:
# photos never leave the machine, the app is a static page served by nginx.
set -euo pipefail

cd "$(dirname "$0")"
PORT="${CLIPMILL_PORT:-8080}"
NAME="clipmill"

need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少命令：$1"; exit 1; }; }

case "${1:-up}" in
  down)
    need docker
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    echo "ClipMill 已停止。"
    ;;
  logs)
    need docker
    docker logs -f "$NAME"
    ;;
  up|"")
    need docker
    if docker compose version >/dev/null 2>&1; then
      CLIPMILL_PORT="$PORT" docker compose up -d --build
    else
      echo "未检测到 docker compose，改用 docker build / run。"
      docker build -t clipmill:latest .
      docker rm -f "$NAME" >/dev/null 2>&1 || true
      docker run -d --name "$NAME" --restart unless-stopped -p "${PORT}:80" clipmill:latest
    fi
    echo
    echo "ClipMill 已启动：http://localhost:${PORT}"
    echo "提示：导出视频依赖 WebCodecs，请通过 HTTPS 或 localhost 访问（例如用 Caddy/Traefik 反向代理加证书）。"
    echo "局域网内用 http://NAS-IP:${PORT} 可以编辑，但导出需要安全上下文。"
    ;;
  *)
    echo "用法：$0 [up|down|logs]"
    exit 1
    ;;
esac
