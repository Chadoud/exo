#!/usr/bin/env bash
# Build a macOS .dmg. Default: native arch (arm64 or x64). Universal: EXO_MAC_UNIVERSAL=1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UNIVERSAL="${EXO_MAC_UNIVERSAL:-0}"
export EXO_MAC_UNIVERSAL

stage_onedir_slice() {
  local src="$1"
  local dest="$2"
  node -e "
    const { stageOnedirDirectory } = require(require('path').join(process.argv[1], 'scripts/lib/backend-onedir.cjs'));
    stageOnedirDirectory(process.argv[2], process.argv[3]);
  " "$ROOT" "$src" "$dest"
}

echo "==> Installing dependencies (if needed)"
npm install
(cd frontend && npm install)
pip3 install -r backend/requirements.txt pyinstaller

echo "==> Frontend"
npm run build:frontend

echo "==> Backend (PyInstaller onedir)"
mkdir -p electron/resources
cd backend

if [ "$UNIVERSAL" = "1" ]; then
  HOST_ARCH="$(uname -m)"
  echo "    universal — separate x64 + arm64 PyInstaller onedir slices (host: ${HOST_ARCH})"
  rm -rf build dist

  if [ "$HOST_ARCH" = "arm64" ]; then
    PYINSTALLER_TARGET_ARCH=arm64 python3 -m PyInstaller backend.spec
    stage_onedir_slice "$ROOT/backend/dist/backend" "$ROOT/electron/resources/backend-arm64"
    rm -rf build dist
    PYINSTALLER_TARGET_ARCH=x86_64 python3 -m PyInstaller backend.spec
    stage_onedir_slice "$ROOT/backend/dist/backend" "$ROOT/electron/resources/backend-x64"
  else
    python3 -m PyInstaller backend.spec
    stage_onedir_slice "$ROOT/backend/dist/backend" "$ROOT/electron/resources/backend-x64"
    rm -rf build dist
    if ! PYINSTALLER_TARGET_ARCH=arm64 python3 -m PyInstaller backend.spec; then
      echo "ERROR: arm64 backend slice failed on Intel Mac (PyInstaller cannot cross-compile with x86_64 Python)."
      echo "Build universal releases via GitHub Actions (Build Installers) or an Apple Silicon Mac."
      exit 1
    fi
    stage_onedir_slice "$ROOT/backend/dist/backend" "$ROOT/electron/resources/backend-arm64"
  fi
else
  echo "    native $(uname -m) only"
  rm -rf build dist
  python3 -m PyInstaller backend.spec
  NATIVE_SLICE="$([ "$(uname -m)" = arm64 ] && echo backend-arm64 || echo backend-x64)"
  stage_onedir_slice "$ROOT/backend/dist/backend" "$ROOT/electron/resources/$NATIVE_SLICE"
fi
cd "$ROOT"

node scripts/stage-mac-backend-slices.cjs

if [ -n "${MAC_SIGN_IDENTITY:-}" ]; then
  echo "==> Codesigning backend onedir slices"
  for slice in electron/resources/backend-x64 electron/resources/backend-arm64; do
    if [ -d "$slice" ]; then
      node -e "
        const { codesignMacOnedirSlice } = require('./scripts/lib/backend-onedir.cjs');
        codesignMacOnedirSlice(process.argv[1], process.argv[2], process.argv[3]);
      " "$slice" "$MAC_SIGN_IDENTITY" "electron/entitlements.mac.plist"
    fi
  done
else
  echo "==> Skipping backend codesign (MAC_SIGN_IDENTITY not set)"
fi

bash scripts/prepare-release-resources.sh
node scripts/generate-mac-icns.js
npm run package:mac

if [ "$UNIVERSAL" = "1" ]; then
  echo "Done: dist-installer/Exo-universal.dmg (+ Exo.dmg alias)"
else
  NATIVE_ARCH="$([ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)"
  echo "Done: dist-installer/Exo-${NATIVE_ARCH}.dmg (+ Exo.dmg alias)"
fi
