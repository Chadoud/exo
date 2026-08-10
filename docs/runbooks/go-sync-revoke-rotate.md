# GO SYNC — device revoke & key rotate

Use when a phone is lost/stolen, a pairing QR/code was exposed, or you need to force all devices onto a new master key.

**Time:** ~15 minutes · **Roles:** account owner (+ ops if cloud DB help needed)

## Threats covered

| Event | Risk |
|-------|------|
| Stolen phone | Local SQLite cache + secure-storage master key until sign-out wipe |
| Leaked QR / paste code | Attacker redeems grant (30m TTL, single-use) if still signed in as same account |
| Compromised desktop keychain | Master key readable → full ciphertext decrypt |

## A. Revoke phone access (user)

1. On the **phone** (if still in hand): Settings → Sign out — clears tokens, pairing key, and deletes the local brain DB (`wipeDatabase`).
2. On **desktop**: change account password / revoke Google/Apple session for that account (cloud JWT invalidates).
3. Optional ops: delete rows in `sync_devices` for that `account_id` + `device_id` if push tokens were registered.

Grant tokens already redeemed cannot be reused. Unredeemed grants expire in ≤30 minutes.

## B. Rotate master key (desktop)

Rotating the key makes old ciphertext unreadible on phones until they **Pair again**.

1. Desktop: Settings → Sync → **turn Sync off**.
2. Delete the profile file `sync_master_key.enc` under the active profile root (or full profile reset if Keychain is stuck).
3. Turn Sync **on** — a new CSPRNG master key is created (fail-closed if Keychain unreadable).
4. Run **Sync now** (required before pairing).
5. **Copy pairing code** / show QR → pair each phone again (same EXO account).
6. Confirm phone Memories/Tasks refresh after pull.

## C. Cloud / ops notes

- Relay stores ciphertext only; rotating the key does **not** require wiping `sync_blobs` / `sync_changes` unless you want a clean feed (optional: delete by `account_id`).
- Change-feed compaction (`EXOSITES_SYNC_CHANGES_KEEP`, default 10000) may return `resync_required` — mobile clears cache and re-pulls.
- Apply migration `023_sync_changes.sql` before relying on grants/feed in any environment.

## D. Sign-off

Record date, account id (internal), devices re-paired, and whether key rotate was performed.
