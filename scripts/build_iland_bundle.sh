#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ILAND_DIR="/mnt/d/OpenClaw/I-land"
BUILD_DIR="$HOME/iland-fe-build"
LOCAL_DIST="$HOME/.iland-data/frontend-dist"
STAGE="$HOME/iland-release-stage"
BUNDLE="/mnt/d/OpenClaw/iland-release.tar.gz"

echo "=== [1/2] Building I-land frontend in WSL2 (tsc + vite) ==="
mkdir -p "$BUILD_DIR"

NEED_INSTALL=0
if [ ! -d "$BUILD_DIR/node_modules" ]; then
  NEED_INSTALL=1
elif ! cmp -s "$ILAND_DIR/frontend/package.json" "$BUILD_DIR/package.json"; then
  NEED_INSTALL=1
fi

cp "$ILAND_DIR/frontend/package.json" "$BUILD_DIR/"
[ -f "$ILAND_DIR/frontend/package-lock.json" ] && cp "$ILAND_DIR/frontend/package-lock.json" "$BUILD_DIR/"
cp "$ILAND_DIR/frontend/tsconfig.json" "$BUILD_DIR/"
cp "$ILAND_DIR/frontend/vite.config.ts" "$BUILD_DIR/"
cp "$ILAND_DIR/frontend/index.html" "$BUILD_DIR/"
rm -rf "$BUILD_DIR/src" "$BUILD_DIR/public"
cp -r "$ILAND_DIR/frontend/src" "$BUILD_DIR/src"
[ -d "$ILAND_DIR/frontend/public" ] && cp -r "$ILAND_DIR/frontend/public" "$BUILD_DIR/public"

cd "$BUILD_DIR"
if [ "$NEED_INSTALL" -eq 1 ]; then
  echo "Installing I-land frontend dependencies..."
  npm install
fi

npm run build

# Update local WSL2 iland.service dist copy when present
if [ -d "$(dirname "$LOCAL_DIST")" ]; then
  rm -rf "$LOCAL_DIST"
  cp -r "$BUILD_DIR/dist" "$LOCAL_DIST"
  systemctl --user restart iland.service 2>/dev/null || true
fi

echo "=== [2/2] Packing clean I-land release bundle (zero DB/uploads) ==="
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -r "$ILAND_DIR/backend" "$STAGE/backend"
find "$STAGE/backend" -type d \( -name '__pycache__' -o -name '.venv' -o -name 'uploads' \) -exec rm -rf {} +
find "$STAGE/backend" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.pyc' \) -delete
cp -r "$BUILD_DIR/dist" "$STAGE/frontend-dist"

tar -czf "$BUNDLE" -C "$STAGE" .
ls -lh "$BUNDLE"
