# Mobile pairing smoke (Simulator + TestFlight)

Use after the Pair → Connect setup UX lands on `incubating/mobile`.

## Last automated attempt (2026-07-24)

| Step | Result |
|------|--------|
| Commit on `incubating/mobile` | Pair → Connect UX (local) |
| Simulator booted (iPhone 15 Pro 17.5) | OK — app running with latest tree |
| Desktop Copy → Connect E2E | **Needs you** — open desktop Exo, Copy, Connect on sim |
| `bundle exec fastlane ios beta` | **Blocked** — Bundler needs sudo for gems; ASC/`FASTLANE_USER` unset |
| Device QR / TestFlight install | Blocked on upload above |

## A — Simulator paste smoke (no camera)

### Desktop

1. Run desktop Electron build on this machine (sync Pro entitlement as usual).
2. Settings → **Sync** → enable sync.
3. Under **Pair mobile device**, confirm QR appears.
4. Click **Copy pairing code** → expect “Copied — paste on your phone”.
5. Leave desktop running (cloud URL must match mobile `env`).

### Mobile (iOS Simulator)

1. `npm run mobile:run:ios` (or `flutter run` on iPhone 15 Pro sim).
2. **Step 1 of 2 · Sign in** (same account / cloud as desktop). Hint mentions a copied code connects on the next step.
3. **Step 2 of 2 · Link phone** — if Mac ↔ Simulator clipboard has the desktop JSON, field is prefilled and copy says “Code ready…”.
4. Tap **Connect** (explicit; no silent auto-apply). Expect first sync (“Updating from desktop…”) → Memories.
5. Alternate: **Scan instead** opens PairingScreen (paste-first on Simulator) → Connect there.
6. Bad / empty field → Connect disabled or friendly error; no master key in logs.

### Dev bypass (debug / `flutter run`)

After sign-in, pair step shows **Skip pairing (dev)** → enters the shell without a master key. Sync stays unavailable until a real pair from Settings. Not available in production release / TestFlight.

### Pass / fail

| Check | Pass? |
|-------|-------|
| Sign-in → Link phone (no second paste maze) | |
| Clipboard prefill + Connect one-tap | |
| Connect disabled / error when empty or invalid | |
| Scan instead → PairingScreen still pairs | |
| First sync after Connect (token + master key) | |
| Debug: Skip pairing (dev) after account sign-in | |

## B — TestFlight + device QR smoke

### Ops (once per machine / CI)

1. Confirm Apple team, App ID `com.exosites.exosites_mobile`, certs, `mobile/ios/ExportOptions.plist`.
2. Set ASC API key env per [`docs/MOBILE_CI_SECRETS.md`](../MOBILE_CI_SECRETS.md) (`FASTLANE_USER` / API key JSON).
3. `npm run mobile:quality` green on the commit to ship.
4. Optional cloud: `npm run verify:go-sync` / deploy verify per [`MOBILE_RELEASE.md`](../MOBILE_RELEASE.md).

### Upload

```bash
cd mobile
bundle exec fastlane ios beta
# or: tag mobile-v* for CI signed artifact, then upload
```

### Device

1. App Store Connect → invite your Apple ID as internal tester.
2. Install build via **TestFlight**.
3. Sign in → Link phone → **Scan instead** → scan desktop QR (camera path).
4. Or: Copy on desktop before/during step 2 → **Connect**.
5. Sync → confirm memories.

### Pass / fail

| Check | Pass? |
|-------|-------|
| IPA uploads / processing | |
| TestFlight install | |
| Camera QR pair (Scan instead) | |
| Clipboard Connect path | |
| Sync + memories | |

## C — BriefingOffer / cube (quick)

| Check | Where | Pass? |
|-------|--------|-------|
| Boot cube draws then crossfades to filled mark (no pop) | cold launch | |
| Land asks for briefing (offer chrome) before auto-running | desktop land | |
| Offer buttons ≥ ~40px; localized error | desktop voice | |
