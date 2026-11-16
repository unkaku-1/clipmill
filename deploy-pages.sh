#!/usr/bin/env bash
# One-click GitHub Pages deployment without any CI configuration.
#
#   ./deploy-pages.sh                 build and push dist/ to the gh-pages branch
#   REPO=user/clipmill ./deploy-pages.sh
#
# Then in the repository: Settings → Pages → Build and deployment →
# Source: "Deploy from a branch", Branch: gh-pages / (root).
# Afterwards the site is available at https://<user>.github.io/<repo>/ over HTTPS,
# which is exactly what WebCodecs (video export) needs.
set -euo pipefail
cd "$(dirname "$0")"

REPO="${REPO:-$(git remote get-url github 2>/dev/null | sed -E 's#.*github\.com[:/](.+)\.git#\1#' || true)}"
if [ -z "${REPO:-}" ]; then
  echo "请设置仓库：REPO=用户名/仓库名 ./deploy-pages.sh"
  exit 1
fi
NAME="${REPO##*/}"

command -v pnpm >/dev/null 2>&1 || { echo "缺少 pnpm：npm i -g pnpm"; exit 1; }
[ -d node_modules ] || pnpm install --frozen-lockfile

echo "构建中（BASE_PATH=/${NAME}/）…"
BASE_PATH="/${NAME}/" pnpm build

TMP="$(mktemp -d)"
cp -r dist/. "$TMP/"
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="ClipMill" -c user.email="clipmill@users.noreply.github.com" commit -q -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q -f "https://github.com/${REPO}.git" gh-pages
cd - >/dev/null
rm -rf "$TMP"

echo "已发布到 https://${REPO%%/*}.github.io/${NAME}/"
echo "首次发布请在仓库 Settings → Pages 选择 gh-pages 分支。"
