#!/usr/bin/env bash
# One-shot local mobile runner: verify env → boot simulator → flutter run.
#
# Usage (from repo root):
#   npm run mobile:dev              # iOS Simulator + production API
#   npm run mobile:dev -- --android # prefer Android emulator
#   npm run mobile:dev -- --staging # staging flavor file (same API host today)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FLUTTER="$ROOT/scripts/mobile-flutter.sh"
MOBILE="$ROOT/mobile"

PLATFORM="ios"
# Default production — staging-api.exosites.ch is not a live DNS name (NXDOMAIN).
FLAVOR="${FLAVOR:-production}"
EXTRA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --android) PLATFORM="android" ;;
    --ios) PLATFORM="ios" ;;
    --staging) FLAVOR="staging" ;;
    --production) FLAVOR="production" ;;
    --help|-h)
      cat <<'EOF'
mobile:dev — boot device + run Exo mobile locally

  npm run mobile:dev                 iOS Simulator, production API (api.exosites.ch)
  npm run mobile:dev -- --android    Android emulator
  npm run mobile:dev -- --staging    staging flavor file

Stops a previous flutter run for this app if one is still attached.
EOF
      exit 0
      ;;
    *) EXTRA_ARGS+=("$arg") ;;
  esac
done

ENV_FILE="$MOBILE/env/${FLAVOR}.json"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: missing flavor file $ENV_FILE"
  exit 1
fi

echo "==> Flutter SDK"
if ! "$FLUTTER" --version >/dev/null 2>&1; then
  echo "FAIL: Flutter not found. Install FVM or Flutter (see mobile/README.md)."
  exit 1
fi
"$FLUTTER" --version | head -3

echo "==> Manifests (OAuth + camera)"
bash "$ROOT/scripts/verify-mobile-manifests.sh"

echo "==> Dependencies"
(cd "$MOBILE" && "$FLUTTER" pub get)

# Stop a leftover flutter run for this project (avoids stuck hot-reload sessions).
if pgrep -f "flutter.*run" >/dev/null 2>&1; then
  if pgrep -f "$MOBILE" >/dev/null 2>&1 || pgrep -fl "flutter_tools.snapshot run" >/dev/null 2>&1; then
    echo "==> Stopping previous flutter run for this project"
    pkill -f "flutter_tools.snapshot run" 2>/dev/null || true
    pkill -f "scripts/mobile-flutter.sh run" 2>/dev/null || true
    sleep 1
  fi
fi

pick_ios_device() {
  local json id
  json="$("$FLUTTER" devices --machine 2>/dev/null || true)"
  id="$(DEVICE_JSON="$json" python3 - <<'PY'
import json, os, sys
try:
    devices = json.loads(os.environ.get("DEVICE_JSON") or "[]")
except Exception:
    devices = []
ios = [d for d in devices if d.get("targetPlatform") == "ios"]
# Simulator only — physical devices need Developer Mode and break local QR-less pairing DX.
for d in ios:
    if d.get("emulator") and d.get("id"):
        print(d["id"])
        sys.exit(0)
sys.exit(1)
PY
)" || true
  echo "${id:-}"
}

# Boot a concrete iPhone via simctl — `open -a Simulator` alone often shows no device.
boot_ios_simulator() {
  local udid name
  # Prefer a known good phone; fall back to first available iPhone.
  udid="$(python3 - <<'PY'
import re, subprocess, sys
text = subprocess.check_output(
    ["xcrun", "simctl", "list", "devices", "available"],
    text=True,
    stderr=subprocess.DEVNULL,
)
prefer = [
    "iPhone 15 Pro",
    "iPhone 16 Pro",
    "iPhone 17 Pro",
    "iPhone 15",
    "iPhone 16",
    "iPhone 17",
]
pat = re.compile(r"^\s*(iPhone[^\(]+)\(([0-9A-Fa-f-]{36})\)\s*\((Shutdown|Booted)\)")
found = []
for line in text.splitlines():
    m = pat.match(line)
    if not m:
        continue
    name, udid, state = m.group(1).strip(), m.group(2), m.group(3)
    found.append((name, udid, state))
for want in prefer:
    for name, udid, state in found:
        if name == want:
            print(udid)
            raise SystemExit(0)
for name, udid, state in found:
    print(udid)
    raise SystemExit(0)
raise SystemExit(1)
PY
)" || true

  if [[ -z "${udid:-}" ]]; then
    return 1
  fi

  name="$(xcrun simctl list devices 2>/dev/null | grep "$udid" | head -1 | sed -E 's/^[[:space:]]*//; s/ \(.*//')"
  echo "    Booting ${name:-iPhone} ($udid)…"
  # Already Booted → non-zero; ignore.
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator --args -CurrentDeviceUDID "$udid"
  # Give CoreSimulator a moment to register with Flutter.
  for _ in $(seq 1 45); do
    sleep 2
    if [[ -n "$(pick_ios_device)" ]]; then
      return 0
    fi
  done
  return 1
}

pick_android_device() {
  local json id
  json="$("$FLUTTER" devices --machine 2>/dev/null || true)"
  id="$(DEVICE_JSON="$json" python3 - <<'PY'
import json, os, sys
try:
    devices = json.loads(os.environ.get("DEVICE_JSON") or "[]")
except Exception:
    devices = []
androids = [d for d in devices if d.get("targetPlatform") == "android"]
for d in androids:
    if d.get("id"):
        print(d["id"])
        sys.exit(0)
sys.exit(1)
PY
)" || true
  echo "${id:-}"
}

DEVICE_ID=""
if [[ "$PLATFORM" == "ios" ]]; then
  if [[ "$(uname)" != "Darwin" ]]; then
    echo "FAIL: iOS run requires macOS. Use: npm run mobile:dev -- --android"
    exit 1
  fi
  echo "==> iOS Simulator"
  DEVICE_ID="$(pick_ios_device)"
  if [[ -z "$DEVICE_ID" ]]; then
    if ! boot_ios_simulator; then
      echo "FAIL: could not boot an iPhone simulator."
      echo "Try: xcrun simctl boot \"iPhone 15 Pro\" && open -a Simulator"
      exit 1
    fi
    DEVICE_ID="$(pick_ios_device)"
  fi
  if [[ -z "$DEVICE_ID" ]]; then
    echo "FAIL: simulator booted but Flutter still does not see it."
    echo "Try: bash scripts/mobile-flutter.sh devices"
    exit 1
  fi
  # Ensure iOS 15.5+ for mobile_scanner (idempotent)
  if [[ -f "$MOBILE/ios/Podfile" ]] && ! grep -q "platform :ios, '15.5'" "$MOBILE/ios/Podfile"; then
    echo "==> Patching Podfile for iOS 15.5"
    bash "$MOBILE/setup.sh" >/dev/null
  fi
  if [[ ! -d "$MOBILE/ios/Pods" ]]; then
    echo "==> pod install"
    (cd "$MOBILE/ios" && pod install)
  fi
else
  echo "==> Android device/emulator"
  DEVICE_ID="$(pick_android_device)"
  if [[ -z "$DEVICE_ID" ]]; then
    echo "    No Android device — trying flutter emulators…"
    EMU="$("$FLUTTER" emulators 2>/dev/null | awk '/•/{print $1; exit}')"
    if [[ -n "${EMU:-}" ]]; then
      "$FLUTTER" emulators --launch "$EMU" || true
      for _ in $(seq 1 45); do
        sleep 2
        DEVICE_ID="$(pick_android_device)"
        if [[ -n "$DEVICE_ID" ]]; then
          break
        fi
      done
    fi
  fi
  if [[ -z "$DEVICE_ID" ]]; then
    echo "FAIL: no Android emulator/device. Start one from Android Studio, then retry."
    exit 1
  fi
fi

echo "==> Device: $DEVICE_ID"
echo "==> Flavor: $FLAVOR ($ENV_FILE)"
echo "==> flutter run"
exec "$FLUTTER" run \
  -d "$DEVICE_ID" \
  --dart-define-from-file="$ENV_FILE" \
  "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
