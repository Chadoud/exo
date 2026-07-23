# UI/UX P0 audit (mobile + land offer) — 2026-07-23

Scope: TestFlight pairing path, boot cube, BriefingOffer chrome. P1 listed for follow-up.

## P0 (addressed this slice)

| Item | Outcome |
|------|---------|
| Simulator cannot scan QR | Desktop **Copy pairing code** (main-process clipboard) + mobile paste-first when scanner errors (no black “No cameras” dead-end) |
| Boot cube stroke → filled SVG pop | `ExoCubeIntro` crossfades to `ExoCubeSvg` before `onComplete` |
| BriefingOffer token split / tiny taps | Shared `text-text-*` tokens; buttons `min-h-10` |
| Hardcoded EN error fallback in hook | Empty server message → chrome `t("briefingOffer.error")` |

## P1 (not in this slice)

| Item | Notes |
|------|--------|
| Land warm still opens mic/WS for offer | Heavier than ideal for Not now / Never |
| Optimistic FE `loading` before server ack | Snappy; can race if WS drops mid-accept |
| Pairing screen EN-only copy | Still `SyncUserMessages` constants (ARB later) |
| Desktop pair UI EN was hardcoded | Now i18n under `sync.pair*` |

## TestFlight

**Blocker (this machine):** `mobile/fastlane` exists but no App Store Connect API key / `FASTLANE_USER` in the local env. Cannot run `cd mobile && bundle exec fastlane ios beta` until ASC signing + Fastlane secrets are provisioned (see [MOBILE_RELEASE.md](./MOBILE_RELEASE.md) §5 and [MOBILE_CI_SECRETS.md](./MOBILE_CI_SECRETS.md)).

**Workaround shipped:** paste-pair for Simulator / no-camera devices so QR pairing is not required for local QA.

**Security (pairing IPC):** review OK to merge; clipboard plaintext pairing JSON is accepted as same class as QR leak (optional later: copy warning / timed clipboard clear).
