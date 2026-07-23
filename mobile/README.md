# Exo Mobile (Flutter)

GO SYNC mobile client for **iOS** and **Android**. Requires **Flutter 3.24.5** (see [`.fvm/fvm_config.json`](../.fvm/fvm_config.json)).

## Module map

| Area | Path | Responsibility |
|------|------|----------------|
| Auth | `lib/features/auth/` | Google OAuth deep link (`exosites://oauth`) + code exchange / refresh |
| Sync | `lib/sync/` | Crypto, cloud API, pull engine, SQLite cache, user-facing messages |
| Session | `lib/app/mobile_sync_config.dart` | App-wide auth/sync session (secure storage + local DB) |
| Settings | `lib/features/settings/` | Pairing QR, crash opt-in, sign-out |
| UI | `lib/features/{today,memory,search,capture}/` + `lib/layout/` | Adaptive shell + tabs |
| Telemetry | `lib/telemetry/` | Opt-in crash ingest |
| Config | `lib/app/exo_config.dart` + `env/*.json` | Flavors (URLs only — no secrets) |

## First-time setup

From repository root:

```bash
npm run mobile:setup
```

Generates `ios/` + `android/` on first run, patches OAuth deep links + camera privacy string, then generates Exo icons/splash from `electron/assets/icon.png`.

Committed manifests are the source of truth; `npm run mobile:verify-manifests` fails if OAuth scheme / camera string regress (or if mic returns before Capture ships).

**Flutter version:** CI pins **3.24.5** (`.fvm/fvm_config.json`). Local Homebrew Flutter works for dev; for release builds match CI via [FVM](https://fvm.app):

```bash
dart pub global activate fvm
fvm install 3.24.5
fvm use 3.24.5
```

## Run

**All-in-one (recommended locally):**

```bash
npm run mobile:dev                 # verify env → boot Simulator → run (staging)
npm run mobile:dev -- --android    # same for Android emulator
npm run mobile:dev -- --production # production API URLs
```

Lower-level:

```bash
npm run mobile:run:ios      # macOS + Xcode (device must already be booted)
npm run mobile:run:android  # Android SDK / emulator
```

## Quality gate

```bash
npm run mobile:quality   # setup + verify-manifests + analyze + test
```

CI: [`.github/workflows/mobile.yml`](../.github/workflows/mobile.yml) on every PR touching `mobile/`.

## Flavors

| Flavor | Dart defines | Cloud API |
|--------|----------------|-----------|
| production (default for `npm run mobile:dev`) | `--dart-define-from-file=env/production.json` | `https://api.exosites.ch` |
| staging | `--dart-define-from-file=env/staging.json` | same host today (`staging-api.exosites.ch` is not live DNS) |

Optional: `--dart-define=APP_VERSION=0.2.0` (defaults match `pubspec.yaml`). Crash ingest via `EXOSITES_CRASH_INGEST_URL` / `EXOSITES_CRASH_INGEST_TOKEN` dart-defines only.

## GO SYNC flow

1. **Desktop:** Settings → Sync → enable GO SYNC → **Pair mobile device** QR (or **Copy pairing code** for Simulator).
2. **Mobile (first launch):** guided setup — Apple / Google / email → scan/paste desktop code → first sync → **Memories**.
3. **Debug only:** after sign-in, **Skip pairing (dev)** enters the shell without a master key (sync off until you pair from Settings). Never in production release / TestFlight unless `EXOSITES_DEV_SKIP_PAIR=true` on a non-production flavor.
4. **Pull to refresh** on Memories (or AppBar sync) updates the local SQLite cache.
5. **Sign out** confirms, then clears tokens, master key, pairing, cursor, and local DB.

Tabs after setup: **Today · Memory · Search** (Capture is deferred — not in the tab bar).

## Deferred (post-beta / Store GA)

Tracked for a later release — do not declare mic/camera beyond pairing until shipped:

- Voice **Capture** + outbound `pushLocalRecords`
- `flutter_localizations` / ARB (copy is centralized in `lib/sync/user_messages.dart` for extraction)
- Background sync policy, cert pinning decision, a11y audit, memory filters

## Branch home

This app lives on **`incubating/mobile`**, not on `main`. Desktop trunk points here via [`docs/MOBILE.md`](../docs/MOBILE.md).

### Syncing from `main` (mandatory)

After mobile was removed from `main`, a naive merge will delete `mobile/` and mobile tooling on this branch. Every sync:

```bash
git checkout incubating/mobile
git fetch origin
git merge origin/main
# If Git deletes mobile surfaces, restore ours:
git checkout HEAD -- mobile/ .fvm/ .github/workflows/mobile.yml \
  scripts/mobile-*.sh scripts/release-mobile.sh scripts/bump-mobile-version.sh \
  scripts/verify-mobile-manifests.sh docs/MOBILE_*.md
# Reconcile package.json: keep desktop scripts from main; keep mobile:* / release:mobile from incubating
npm run mobile:quality
```

Prefer merge over rebase for this long-lived branch. Do not reset incubating to `main`.

## Release

See [`docs/MOBILE_RELEASE.md`](../docs/MOBILE_RELEASE.md) and [`docs/MOBILE_STORE_PRIVACY.md`](../docs/MOBILE_STORE_PRIVACY.md).

Tag `mobile-v*` **from this branch** to trigger optional CI build artifacts (AAB + iOS). Pre-tag: `npm run release:mobile`.
