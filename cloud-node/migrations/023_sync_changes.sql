-- GO SYNC change feed — append-only delivery log (cursor = change_seq).
-- sync_blobs remains current state; pulls read sync_changes so updates are visible.
-- Reverse: DROP TABLE sync_changes; DROP TABLE sync_pairing_grants;

CREATE TABLE IF NOT EXISTS sync_changes (
  change_seq BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  collection VARCHAR(64) NOT NULL,
  record_id VARCHAR(128) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  logical_clock BIGINT NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  schema_version INT NOT NULL DEFAULT 1,
  ciphertext MEDIUMTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sync_changes_pull (account_id, change_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill once when the change feed is empty (safe re-apply).
INSERT INTO sync_changes (
  account_id, collection, record_id, device_id, logical_clock, updated_at,
  deleted, schema_version, ciphertext, content_hash
)
SELECT
  b.account_id, b.collection, b.record_id, b.device_id, b.logical_clock, b.updated_at,
  b.deleted, b.schema_version, b.ciphertext, b.content_hash
FROM sync_blobs b
WHERE NOT EXISTS (SELECT 1 FROM sync_changes LIMIT 1)
ORDER BY b.id ASC;

-- Short-lived pairing grants (account-bound redeem).
CREATE TABLE IF NOT EXISTS sync_pairing_grants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  -- SHA-256 hex of raw master key bytes — redeem must present the same fingerprint.
  key_fingerprint CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  redeemed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sync_pairing_token (token_hash),
  KEY idx_sync_pairing_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
