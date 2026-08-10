#!/usr/bin/env bash
# Desktop release gate — run locally before tagging v*.
# On success writes .git/exo-release-gate (required by pre-push for v* tags).
#
# Usage:
#   ./scripts/release-desktop.sh
#   ./scripts/release-desktop.sh --skip-cloud   # skip live API smoke
#
# Packaging is required for a valid stamp. RELEASE_SKIP_PACKAGING=1 skips the
# unsigned Mac smoke but does NOT write a stamp (tag push stays blocked).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_CLOUD=0
for arg in "$@"; do
  if [[ "$arg" == "--skip-cloud" ]]; then
    SKIP_CLOUD=1
  fi
done

echo "==> Release resources"
bash scripts/prepare-release-resources.sh

echo "==> Production verify (IPC + handlers)"
node scripts/verify-main-register-handlers.cjs
node scripts/validate-electron-ipc-manifest.cjs
node scripts/validate-electron-dts.cjs

if [[ "$SKIP_CLOUD" == "0" ]]; then
  echo "==> Cloud auth + GO SYNC relay smoke"
  npm run verify:cloud-auth
else
  echo "==> Skipped cloud smoke (--skip-cloud)"
fi

echo "==> Legal URLs"
npm run verify:legal-urls || echo "WARN: legal URLs not reachable — required before store builds"

echo "==> Backend import smokes"
(
  cd backend
  python3 -c "
from voice_session import GEMINI_VOICE_MODEL_DEFAULT, resolve_gemini_voice_model
assert GEMINI_VOICE_MODEL_DEFAULT and callable(resolve_gemini_voice_model)
print('voice_session re-exports OK')
"
  python3 -c "
import main
assert getattr(main, 'app', None) is not None or callable(getattr(main, 'create_app', None))
print('backend main import OK')
"
)

echo "==> Fail-fast: backend pytest (same suite as CI quality-backend)"
npm run test:backend

echo "==> Playwright browsers (required for quality e2e)"
if ! (cd frontend && npx playwright install chromium); then
  echo "ERROR: Playwright chromium missing. Run: cd frontend && npx playwright install --with-deps chromium" >&2
  exit 1
fi

echo "==> Quality gate (lint, tests — may take several minutes)"
npm run quality

PACKAGING_OK=0
if [[ "${RELEASE_SKIP_PACKAGING:-0}" == "1" ]]; then
  echo ""
  echo "WARN: RELEASE_SKIP_PACKAGING=1 — skipping unsigned Mac packaging smoke."
  echo "      No release gate stamp will be written; v* tag push stays blocked."
else
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "ERROR: unsigned Mac packaging smoke requires macOS (uname=$(uname -s))." >&2
    echo "Run release:desktop on a Mac, or set RELEASE_SKIP_PACKAGING=1 (no stamp)." >&2
    exit 1
  fi

  echo "==> Unsigned native Mac packaging smoke (no Apple notarize secrets)"
  echo "    CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac"
  CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac

  echo "==> verify:packaged-app"
  npm run verify:packaged-app

  NATIVE_SLICE="electron/resources/backend-arm64/backend"
  if [[ "$(uname -m)" != "arm64" ]]; then
    NATIVE_SLICE="electron/resources/backend-x64/backend"
  fi
  if [[ ! -f "$NATIVE_SLICE" ]]; then
    if [[ -f electron/resources/backend-arm64/backend ]]; then
      NATIVE_SLICE="electron/resources/backend-arm64/backend"
    elif [[ -f electron/resources/backend-x64/backend ]]; then
      NATIVE_SLICE="electron/resources/backend-x64/backend"
    else
      echo "ERROR: native backend onedir executable not found under electron/resources/" >&2
      exit 1
    fi
  fi

  echo "==> verify-mac-backend-health (${NATIVE_SLICE})"
  # Log path only — never dump env or OAuth JSON
  bash scripts/verify-mac-backend-health.sh "$NATIVE_SLICE"
  PACKAGING_OK=1
fi

if [[ "$PACKAGING_OK" != "1" ]]; then
  echo ""
  echo "Release quality checks passed, but packaging smoke was skipped — stamp NOT written."
  echo "Re-run without RELEASE_SKIP_PACKAGING to unlock v* tag push."
  exit 0
fi

bash scripts/write-release-gate.sh desktop

VERSION="$(node -p "require('./package.json').version")"
echo ""
echo "Release gate passed (stamp written for v${VERSION} @ HEAD)."
echo "If you still need to bump version: bump + commit FIRST, then re-run this script."
echo "Next (version already correct):"
echo "  1. npm run verify:release-version -- --version ${VERSION}"
echo "  2. git tag v${VERSION} && git push origin v${VERSION}"
echo "  3. Watch Actions; install staging DMG for live QA"
echo ""
echo "Optional closer-to-CI (Apple Silicon): EXO_MAC_UNIVERSAL=1 npm run build:mac"
echo "Residual CI-only: notarize, Windows ISS, universal dual-arch on CI runners."
