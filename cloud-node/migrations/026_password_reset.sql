-- Password reset tokens — hashed, single-use, short TTL.
-- Same shape as auth_exchange_codes (002_auth_identities.sql): plaintext token
-- is only ever returned once to the caller; the DB stores a SHA-256 hash.
-- Reverse: DROP TABLE password_reset_tokens;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_password_reset_account (account_id),
  KEY idx_password_reset_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
