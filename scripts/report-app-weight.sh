#!/usr/bin/env bash
# Report install-size breakdown for the desktop app (macOS .app or DMG when present).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

human() {
  if [ -f "$1" ]; then
    du -sh "$1" | awk '{print $1}'
  else
    echo "—"
  fi
}

echo "=== Exo app weight report ==="
echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo

DMG="$ROOT/dist-installer/Exo.dmg"
APP=""
for candidate in \
  "$ROOT/dist-installer/mac/Exo.app" \
  "$ROOT/dist-installer/mac-arm64/Exo.app" \
  "$ROOT/dist-installer/mac-x64/Exo.app" \
  "$ROOT/dist-installer/mac-universal/Exo.app"; do
  if [ -d "$candidate" ]; then
    APP="$candidate"
    break
  fi
done
BACKEND_RES=""
for candidate in \
  "$ROOT/electron/resources/backend-arm64" \
  "$ROOT/electron/resources/backend-x64" \
  "$ROOT/electron/resources/backend"; do
  if [ -e "$candidate" ]; then
    BACKEND_RES="$candidate"
    break
  fi
done
FRONTEND_DIST="$ROOT/frontend/dist/assets"

echo "## Installer"
printf "  DMG:              %s (%s)\n" "$(human "$DMG")" "${DMG#"$ROOT"/}"
printf "  Packaged .app:    %s\n" "$(human "$APP")"
echo

if [ -d "$APP/Contents" ]; then
  echo "## macOS .app breakdown ($APP)"
  printf "  Electron Framework: %s\n" "$(human "$APP/Contents/Frameworks/Electron Framework.framework")"
  BACKEND_IN_APP=""
  for candidate in \
    "$APP/Contents/Resources/backend-arm64" \
    "$APP/Contents/Resources/backend-x64" \
    "$APP/Contents/Resources/backend"; do
    if [ -e "$candidate" ]; then
      BACKEND_IN_APP="$candidate"
      break
    fi
  done
  printf "  Python backend:     %s\n" "$(human "$BACKEND_IN_APP")"
  printf "  app.asar:           %s\n" "$(human "$APP/Contents/Resources/app.asar")"
  echo
fi

if [ -n "$BACKEND_RES" ]; then
  echo "## Dev backend onedir (pre-package)"
  printf "  %s: %s\n" "${BACKEND_RES#"$ROOT"/}" "$(human "$BACKEND_RES")"
  echo
fi

if [ -d "$FRONTEND_DIST" ]; then
  echo "## Frontend dist (gzip via build output)"
  total_js=0
  while IFS= read -r -d '' f; do
    size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
    total_js=$((total_js + size))
    printf "  %s  %s\n" "$(numfmt --to=iec-i --suffix=B "$size" 2>/dev/null || echo "${size}B")" "${f#"$FRONTEND_DIST"/}"
  done < <(find "$FRONTEND_DIST" -name '*.js' -print0 2>/dev/null | sort -z)
  echo "  Total JS: $(numfmt --to=iec-i --suffix=B "$total_js" 2>/dev/null || echo "${total_js} bytes")"
  echo
fi

echo "## Budgets (update when intentionally changing size)"
echo "  DMG target (native arch): <= 300 MB"
echo "  DMG target (universal):   <= 400 MB"
echo "  backend binary target:    <= 200 MB"
echo "  Main JS chunk target:     <= 800 KB (pre-gzip)"
echo
echo "Native vs universal: EXO_MAC_UNIVERSAL=1 npm run build:mac"
echo "Run frontend bundle analysis: cd frontend && npm run analyze"
