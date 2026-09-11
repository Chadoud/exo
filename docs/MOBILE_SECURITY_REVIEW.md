# Mobile security review notes (GO SYNC beta)

Threat model: stolen phone, malicious QR, XSS on unrelated sites is out of scope; focus on auth deep links, secure storage, and master-key handling.

## Reviewed controls

| Control | Status | Notes |
|---------|--------|-------|
| OAuth callback scheme `exosites://oauth` | OK | Committed in Info.plist + AndroidManifest; guarded by `scripts/verify-mobile-manifests.sh` |
| Tokens in Keychain/Keystore | OK | Via `FlutterSecureStorage` / `KeyValueStore` |
| Master key never sent to API | OK | Decrypt only on device; relay stores ciphertext |
| Sign-out wipe | OK | Clears access/refresh, master key, `sync_paired`, cursor, SQLite DB |
| QR master key | WARN (by design) | Treat QR like a password; desktop shows only when user starts pairing |
| Refresh on 401 | OK | Single-flight `/auth/refresh`; failed refresh clears session |
| Crash ingest | OK | Opt-in; truncated fields; no paths/prompts |
| Store IAP secrets | OK | None in the Flutter binary; Apple/Play keys stay in cloud-node env |
| Store receipt verify | OK | Phone sends JWS / Play token once; cloud live-fetches; never log `purchaseToken` / JWS |
| EventKit calendars | OK | Read-only; prompt after explicit tap; count only over the channel; not uploaded |
| First-run / pair dev skip | OK | `resolveDevSkip` is false in production **release**; dart-defines must not land in `mobile/env/production.json` |

## Residual risks

- Pairing QR screenshot/leak grants decrypt capability until user re-pairs or rotates key on desktop.
- No certificate pinning (standard TLS) — document before adding.
- Capture / outbound push deferred — do not re-add mic permission until that feature ships.

## Pre-merge checklist (auth/sync PRs)

- [ ] Manifest guard still green
- [ ] New secrets never logged
- [ ] Wipe path covered by unit test
- [ ] Deep-link errors do not crash the isolate
