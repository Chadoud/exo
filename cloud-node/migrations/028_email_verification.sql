-- Email verification tokens — hashed, single-use, 24h TTL.
-- Deliberately a separate table from auth_exchange_codes (short-lived OAuth
-- handoff, different TTL/config knob) and password_reset_tokens (different
-- flow/consequence on consume) even though the shape is the same pattern.
-- Reverse: DROP TABLE email_verification_tokens;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_verification_account (account_id),
  KEY idx_email_verification_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
