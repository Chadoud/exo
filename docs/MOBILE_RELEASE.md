# Mobile release (iOS TestFlight + Android Play internal)

Use this checklist before tagging `mobile-v*` and shipping to testers.

## 1. Cloud API + sync relay

```bash
VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh
# Migration 004 (sync relay) runs automatically with deploy.
./scripts/verify-cloud-auth-api.sh   # includes npm run verify:go-sync
```

See [`runbooks/relay-deploy.md`](runbooks/relay-deploy.md).

## 2. Local mobile quality gate

```bash
npm run mobile:quality
```

Runs setup + `mobile:verify-manifests` + `flutter analyze` + `flutter test` on pinned Flutter **3.24.5** (see [`.fvm/fvm_config.json`](../.fvm/fvm_config.json)).

## 3. Version bump

Edit [`mobile/pubspec.yaml`](../mobile/pubspec.yaml) `version:` (semver+build, e.g. `0.2.0+2`).

## 4. Build artifacts

| Platform | Local command | CI (tag `mobile-v*`) |
|----------|---------------|----------------------|
| Android AAB | `cd mobile && flutter build appbundle --release --dart-define-from-file=env/production.json` | `.github/workflows/mobile.yml` → `build-android` |
| iOS IPA | `flutter build ipa --release --dart-define-from-file=env/production.json` (requires signing) | `build-ios` (no codesign artifact) |

### Android signing

1. Create upload keystore (store outside repo).
2. Copy [`mobile/key.properties.example`](../mobile/key.properties.example) → `mobile/android/key.properties`.
3. Set GitHub secrets for release CI: `ANDROID_KEYSTORE_B64`, `ANDROID_KEY_ALIAS`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD` — see [`MOBILE_CI_SECRETS.md`](./MOBILE_CI_SECRETS.md).

### iOS signing

1. Apple Developer Program + App ID `com.exosites.exosites_mobile`.
2. Distribution certificate + provisioning profile in CI secrets.
3. Export options plist at `mobile/ios/ExportOptions.plist` (team-specific).

## 5. Fastlane (optional upload)

```bash
cd mobile
bundle exec fastlane ios beta    # TestFlight
bundle exec fastlane android beta  # Play internal track
```

Requires `FASTLANE_USER`, App Store Connect API key, and Play service account JSON in env.

## 6. Desktop pairing smoke test

Full checklist: [`runbooks/mobile-pairing-smoke.md`](./runbooks/mobile-pairing-smoke.md).

1. Desktop: Settings → Sync → enable GO SYNC.
2. **Device / camera:** Mobile Settings → Pair with desktop → scan the QR.
3. **Simulator / no camera:** Desktop → **Copy pairing code** → Mobile → **Paste from clipboard** (or paste into the field → Use pasted code).
4. Confirm memories appear on the Memory tab after sync.

## 7. Rollback

- **TestFlight / Play:** halt rollout in store console; previous build remains installable.
- **Relay:** blob schema is forward-compatible; do not drop `sync_blobs` without backup.

## Tag convention

Push tag `mobile-v0.2.0` to trigger signed build artifacts in CI (when secrets configured).
