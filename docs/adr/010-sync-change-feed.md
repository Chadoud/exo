# ADR-010: Sync change feed (delivery cursor)

## Status

Accepted

## Context

Pull used `sync_blobs.id > cursor` while updates upserted in place (same `id`). Devices that had passed an id never received later revisions.

## Decision

- `sync_blobs` = current ciphertext state per `(account_id, collection, record_id)`.
- `sync_changes` = append-only log; each accepted LWW write inserts an **immutable envelope snapshot**.
- Pull cursor = `change_seq` (`feed_version: 1`).
- Clients persist `sync_feed_version`; on mismatch, reset cursor and local cache once.

## Pairing grants

`sync_pairing_grants` stores a single-use token hash plus `key_fingerprint` (SHA-256 of the desktop master key). Redeem requires matching JWT `account_id` and the same fingerprint so a swapped key in a QR cannot burn a valid grant.

## Retention

After successful pushes, `compactSyncChanges` keeps the newest `EXOSITES_SYNC_CHANGES_KEEP` rows (default 10000) per account. Pull returns `resync_required` + `snapshot` pages from current `sync_blobs` (paginated via `snapshot_offset`) and a `resume_cursor` (= max `change_seq`) so clients rebuild full state, then resume the change feed.

## Consequences

- Updates and deletes are pullable without re-pair.
- Unbounded growth is capped; clients must handle resync-floor.

