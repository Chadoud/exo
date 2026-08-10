# Mobile deferred work (post-beta)

Scheduled after store beta feedback. Do not block beta on these.

## Progressive test ladder — results (2026-07-23)

Run on branch `incubating/mobile`. Manual device steps need a human with desktop + phone.

| Tier | Scope | Status |
|------|--------|--------|
| **0** Tooling | `npm run mobile:quality`; iOS `--no-codesign` build; manifests (OAuth + camera, no mic) | **PASS** (automated) |
| **1** Auth | Email login/register, OAuth callback, Apple URI, 401 refresh-once, sign-out wipe | **PASS** (unit: `mobile_auth_service_test`, `cloud_api_auth_test`, `mobile_sync_config_test`). Device OAuth/Apple still manual before store beta. |
| **2** Pair + first sync | Desktop QR → scan → Memory list | **Unit PASS** (`applyPairingPayload`, `SyncEngine.pullUntilCaughtUp`). **Device E2E still required** — follow [`runbooks/go-sync-e2e-smoke.md`](runbooks/go-sync-e2e-smoke.md). No blockers found in code review of pairing/sync paths. |
| **3** Surface | Memory / Tasks / offline banner / crash opt-out | **Widget PASS** (empty Memory/Tasks, shell tabs, banner CTA). Offline + crash toggle: unit (`mobile_crash_reporter_test`) + copy (`youreOffline` / `networkFailed`). Physical airplane-mode smoke still manual. |
| **4** Hardening | Thin widget tests for setup + shell + banner | **DONE** — `mobile/test/setup_shell_banner_widget_test.dart` |

### Blockers found

None in automated tiers. Open manual gates before merge-back to `main`:

- [ ] Tier 2 on real devices (desktop QR + phone pull)
- [ ] Tier 1 Apple Sign-In on a physical iPhone
- [ ] Tier 3 airplane-mode banner on device

### Structure (done this pass)

- [x] Moved session façade to [`mobile/lib/app/mobile_sync_config.dart`](../mobile/lib/app/mobile_sync_config.dart) (was under `features/settings/`)

## Capture + outbound sync

- [ ] Capture UI + `NSMicrophoneUsageDescription` / `RECORD_AUDIO` with honest purpose strings
- [ ] Wire `SyncEngine.pushLocalRecords` from Capture/notes
- [ ] Tests for encrypt-push path
- [ ] Update [`MOBILE_STORE_PRIVACY.md`](MOBILE_STORE_PRIVACY.md) before shipping Capture

### LWW / conflicts (short — for support)

Until Capture ships, mobile is **pull-only**. Desktop is the writer for memories. After Capture:

- Same record id: higher `logicalClock` wins (see `SyncCrypto.logicalClock` / Python golden in `sync/tests/fixtures/logical_clock.json`).
- Tombstones from either side delete locally after decrypt.
- Re-pair / new master key does not rewrite old ciphertext; user must sync from a desktop that still has the key.

## Platform completeness

- [x] Apple Sign-In UI (`/auth/mobile/start/apple`) — shipped with email/password on setup
- [ ] `flutter_localizations` / ARB — start from `lib/sync/user_messages.dart`
- [ ] Offline indicators; background sync policy (if product wants it)
- [ ] Cert pinning decision vs threat model
- [ ] Performance budgets: cold start, sync of N blobs

## Tasks — AI draft / review / execute

- [ ] Cloud-LLM suggestions on synced memories/tasks (email draft: to, subject, body; other useful actions)
- [ ] Review UI before any outbound side effect — never auto-send email/message
- [ ] Safe allowlists for any local metadata writes; no blind `pushLocalRecords` from the model

## Product polish

- [ ] Memory filters / collections
- [ ] Deep link to a specific memory
- [ ] Accessibility audit (VoiceOver / TalkBack)
- [ ] Tablet layout polish beyond current breakpoints
