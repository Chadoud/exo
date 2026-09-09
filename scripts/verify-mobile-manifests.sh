#!/usr/bin/env bash
# Assert committed mobile platform files include OAuth deep link + camera privacy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$ROOT/mobile/ios/Runner/Info.plist"
MANIFEST="$ROOT/mobile/android/app/src/main/AndroidManifest.xml"
fail=0

if [[ ! -f "$PLIST" ]]; then
  echo "FAIL: missing $PLIST"
  fail=1
else
  if ! grep -q '<string>exosites</string>' "$PLIST"; then
    echo "FAIL: Info.plist missing CFBundleURLSchemes exosites"
    fail=1
  fi
  if ! grep -q NSCameraUsageDescription "$PLIST"; then
    echo "FAIL: Info.plist missing NSCameraUsageDescription"
    fail=1
  fi
  if grep -q NSMicrophoneUsageDescription "$PLIST"; then
    echo "FAIL: Info.plist still declares NSMicrophoneUsageDescription (Capture deferred)"
    fail=1
  fi
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "FAIL: missing $MANIFEST"
  fail=1
else
  if ! grep -q 'android:scheme="exosites"' "$MANIFEST"; then
    echo "FAIL: AndroidManifest missing exosites scheme"
    fail=1
  fi
  if ! grep -q 'android:host="oauth"' "$MANIFEST"; then
    echo "FAIL: AndroidManifest missing oauth host"
    fail=1
  fi
  if ! grep -q 'android:host="tasks"' "$MANIFEST"; then
    echo "FAIL: AndroidManifest missing tasks deep-link host"
    fail=1
  fi
  if ! grep -q 'android.permission.POST_NOTIFICATIONS' "$MANIFEST"; then
    echo "FAIL: AndroidManifest missing POST_NOTIFICATIONS"
    fail=1
  fi
  if grep -q RECORD_AUDIO "$MANIFEST"; then
    echo "FAIL: AndroidManifest still declares RECORD_AUDIO (Capture deferred)"
    fail=1
  fi
fi

PUBSPEC="$ROOT/mobile/pubspec.yaml"
# A `config:` under `flutter:` needs a newer SDK than the pinned one CI builds
# with, and the older toolchain rejects the whole pubspec at parse time — the
# tag build dies before it analyzes anything. Set such options per machine with
# `flutter config --...` instead.
if [[ -f "$PUBSPEC" ]] && awk '
  /^flutter:/ { in_flutter = 1; next }
  /^[^[:space:]#]/ { in_flutter = 0 }
  in_flutter && /^[[:space:]]+config:/ { found = 1 }
  END { exit !found }
' "$PUBSPEC"; then
  echo "FAIL: pubspec.yaml sets flutter.config — the pinned CI Flutter cannot parse it"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "OK: mobile manifests (OAuth + tasks deep link + camera + local notifs; no mic) + pubspec parses on pinned Flutter"
