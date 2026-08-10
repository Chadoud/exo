# GO SYNC E2E smoke test (manual)

Run after `npm run verify:go-sync` passes against the target relay, and migration **023** is applied (`node cloud-node/scripts/apply-migration-023.js`).

**Time:** ~30 minutes · **Devices:** 1 Mac (desktop) + 1 iPhone or Android phone

## Prerequisites

- [ ] Production/staging relay deployed with `023_sync_changes` (`sync_changes` + `sync_pairing_grants`)
- [ ] `npm run verify:go-sync` green
- [ ] Pro/trial account with `canUseSync: true`
- [ ] Desktop build with QR pairing (`npm run dev` or packaged app)
- [ ] Mobile: `npm run mobile:run:ios` or `mobile:run:android` with matching cloud URL

## Steps

| # | Actor | Action | Pass |
|---|-------|--------|------|
| 1 | Desktop | Sign in → Settings → Sync → enable GO SYNC | Sync toggle on |
| 2 | Desktop | **Sync now** (required before pairing) | “Last synced …” time; pairing QR appears |
| 3 | Mobile | Sign in with **same** EXO account | Signed in |
| 4 | Mobile | Pair → scan QR or paste copied code | Linked; grant redeem succeeds |
| 5 | Desktop | Create/edit a memory; Sync now | Push accepted |
| 6 | Mobile | Pull / Sync now | **Update** appears without re-pair (change feed) |
| 7 | Desktop | Delete or tombstone a synced item; Sync now | Phone removes it after pull |
| 8 | Mobile | Sign out → sign in → Pair again if needed → Sync | Local DB wiped; data returns after pair+pull |

## Failure triage

| Symptom | Check |
|---------|--------|
| Pairing disabled / “Sync once…” | Desktop has not completed a successful Sync yet |
| Code expired / already used | Copy a **fresh** code after Sync |
| Wrong account | Phone JWT `sub` ≠ desktop account — sign in with same account |
| Decrypt error | Stale key — Pair again (clears cache); desktop Keychain readable |
| “Update EXO to continue syncing” | Phone schema too old for relay envelopes |
| Pair OK, empty Memories | Desktop push ran; `/v1/sync/status` blob_count; create data then Sync |
| 401 on sync | Re-sign in on mobile |
| 404 on `/v1/sync/*` | Redeploy cloud-node + apply migrations **including 023** |

## Sign-off

Record tester, date, app versions (desktop + mobile), and account email (internal only) in the release thread.
