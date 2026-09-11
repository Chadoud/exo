#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
FLUTTER="$ROOT/scripts/mobile-flutter.sh"

if ! [[ -x "$FLUTTER" ]]; then
  chmod +x "$FLUTTER"
fi

# First-time: generate platform projects if missing.
if [[ ! -d ios || ! -d android ]]; then
  echo "Generating ios/ and android/ (first-time only)…"
  "$FLUTTER" create . --org com.exosites --platforms=ios,android --project-name exosites_mobile
fi

"$FLUTTER" pub get

INFO_PLIST="ios/Runner/Info.plist"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
# PlistBuddy ships with macOS only. The Linux CI runner cannot patch the plist,
# and does not need to: the committed one already carries these keys, and
# verify-mobile-manifests fails the build if that ever stops being true.
if [[ -f "$INFO_PLIST" && -x "$PLIST_BUDDY" ]]; then
  # Camera required for GO SYNC QR pairing (mobile_scanner).
  if ! grep -q NSCameraUsageDescription "$INFO_PLIST"; then
    "$PLIST_BUDDY" -c "Add :NSCameraUsageDescription string Exo uses the camera to scan the desktop pairing QR code." "$INFO_PLIST" 2>/dev/null || true
    echo "Patched NSCameraUsageDescription"
  fi
  if ! grep -q NSCalendarsUsageDescription "$INFO_PLIST"; then
    "$PLIST_BUDDY" -c "Add :NSCalendarsUsageDescription string EXO reads calendars on this iPhone to show your day. Calendar details stay on this phone." "$INFO_PLIST" 2>/dev/null || true
    echo "Patched NSCalendarsUsageDescription"
  fi
  if ! grep -q NSCalendarsFullAccessUsageDescription "$INFO_PLIST"; then
    "$PLIST_BUDDY" -c "Add :NSCalendarsFullAccessUsageDescription string EXO reads calendars on this iPhone to show your day. Calendar details stay on this phone." "$INFO_PLIST" 2>/dev/null || true
    echo "Patched NSCalendarsFullAccessUsageDescription"
  fi

  # Exact URL scheme "exosites" — do not match CFBundleName "exosites_mobile".
  scheme="$("$PLIST_BUDDY" -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "$INFO_PLIST" 2>/dev/null || true)"
  if [[ "$scheme" != "exosites" ]]; then
    "$PLIST_BUDDY" -c "Delete :CFBundleURLTypes" "$INFO_PLIST" 2>/dev/null || true
    "$PLIST_BUDDY" -c "Add :CFBundleURLTypes array" "$INFO_PLIST"
    "$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0 dict" "$INFO_PLIST"
    "$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$INFO_PLIST"
    "$PLIST_BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string exosites" "$INFO_PLIST"
    echo "Patched iOS URL scheme exosites://"
  fi
fi

MANIFEST="android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST" ]] && ! grep -q 'android:host="oauth"' "$MANIFEST"; then
  python3 - <<'PY'
from pathlib import Path
import re

p = Path("android/app/src/main/AndroidManifest.xml")
text = p.read_text()
if 'android:host="oauth"' in text:
    raise SystemExit(0)

intent = """
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="exosites" android:host="oauth" />
            </intent-filter>"""

# Insert before the closing </activity> of MainActivity (handles multiline activity tags).
pattern = re.compile(
    r'(<activity\b[^>]*android:name="\.MainActivity"[^>]*>)(.*?)(</activity>)',
    re.DOTALL,
)
m = pattern.search(text)
if not m:
    raise SystemExit("MainActivity not found in AndroidManifest.xml")
text = text[: m.start(3)] + intent + "\n        " + text[m.start(3) :]
p.write_text(text)
print("Patched Android OAuth deep link")
PY
fi

# mobile_scanner requires iOS 15.5+
PODFILE="ios/Podfile"
if [[ -f "$PODFILE" ]] && ! grep -q "platform :ios, '15.5'" "$PODFILE"; then
  if grep -qE "^#? ?platform :ios" "$PODFILE"; then
    sed -i '' -E "s/^#? ?platform :ios,.*/platform :ios, '15.5'/" "$PODFILE" 2>/dev/null \
      || sed -i -E "s/^#? ?platform :ios,.*/platform :ios, '15.5'/" "$PODFILE"
  else
    printf "%s\n%s\n" "platform :ios, '15.5'" "$(cat "$PODFILE")" > "$PODFILE.tmp" && mv "$PODFILE.tmp" "$PODFILE"
  fi
  echo "Patched ios/Podfile platform to 15.5"
fi
PBXPROJ="ios/Runner.xcodeproj/project.pbxproj"
if [[ -f "$PBXPROJ" ]] && grep -q "IPHONEOS_DEPLOYMENT_TARGET = 13.0" "$PBXPROJ"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 13.0;/IPHONEOS_DEPLOYMENT_TARGET = 15.5;/g' "$PBXPROJ"
  else
    sed -i 's/IPHONEOS_DEPLOYMENT_TARGET = 13.0;/IPHONEOS_DEPLOYMENT_TARGET = 15.5;/g' "$PBXPROJ"
  fi
  echo "Patched IPHONEOS_DEPLOYMENT_TARGET to 15.5"
fi

if [[ -f pubspec.yaml ]] && grep -q flutter_launcher_icons pubspec.yaml; then
  echo "Generating app icons and splash…"
  "$FLUTTER" pub run flutter_launcher_icons 2>/dev/null || "$FLUTTER" pub run flutter_launcher_icons:main
  "$FLUTTER" pub run flutter_native_splash:create 2>/dev/null || true
fi

echo "Mobile setup complete. Run: npm run mobile:run:ios"
