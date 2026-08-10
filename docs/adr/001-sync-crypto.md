# ADR-001: E2E Sync Cryptography

## Status

Accepted (GA — schema v3 emit; v2 dual-read)

## Context

GO SYNC requires a zero-knowledge relay: the server stores ciphertext only. Desktop and mobile must decrypt locally with a shared master key established via pairing.

## Decision

| Piece | Choice |
|-------|--------|
| **Master key** | CSPRNG 32-byte key generated on desktop; stored in Electron `safeStorage` (`sync_master_key.enc`). Fail-closed if unreadable — never silent regenerate. |
| **Per-record keys** | Deterministic `SHA-256(master_key ‖ collection ‖ record_id)` → 32 bytes (idempotent re-encrypt). |
| **Cipher** | ChaCha20-Poly1305, 12-byte random nonce per encryption. |
| **Schema v1** | Ciphertext only; metadata unauthenticated (legacy pull; tombstones ignored). |
| **Schema v2** | AEAD AAD binds `collection`, `record_id`, `device_id`, `logical_clock`, `deleted`, `schema_version`. |
| **Schema v3 (current emit)** | Same as v2 plus **`account_id`** in AAD. |
| **Pairing** | QR/clipboard carries master key + cloud URL + server-issued short-lived `grant_token` bound to account **and** `key_fingerprint` (SHA-256 of raw key). |
| **Golden vectors** | `sync/testdata/golden_envelopes.json` — asserted in Python + Dart CI. |

## Consequences

- Relay cannot forge deletes/updates without the master key (v2+).
- Cross-account ciphertext swap fails AEAD for v3 even if a key were reused incorrectly.
- Password-derived master keys (Argon2) deferred.
- Revoke/rotate: `docs/runbooks/go-sync-revoke-rotate.md`.
