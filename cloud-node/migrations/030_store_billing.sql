-- Store billing (App Store / Play) — grandfather flag, work role, bind table.
-- Safe to re-apply (IF NOT EXISTS). The one-shot exempt backfill lives in
-- apply-migration-030.js so a second apply cannot mark post-cutoff signups exempt.
-- Reverse: ALTER TABLE accounts DROP COLUMN store_billing_exempt;
--          ALTER TABLE user_profiles DROP COLUMN work_role;
--          DROP TABLE store_subscriptions; DROP TABLE store_events_processed;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS store_billing_exempt TINYINT(1) NOT NULL DEFAULT 0
  AFTER trial_ends_at;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS work_role VARCHAR(64) NULL AFTER locale;

CREATE TABLE IF NOT EXISTS store_subscriptions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  store_original_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  current_period_end DATETIME NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 0,
  last_event_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_identity (platform, store_original_id),
  KEY idx_store_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotency for App Store Server Notifications / Play RTDN (used in the lifecycle slice).
CREATE TABLE IF NOT EXISTS store_events_processed (
  event_id VARCHAR(255) NOT NULL PRIMARY KEY,
  provider VARCHAR(16) NOT NULL,
  event_type VARCHAR(64) NULL,
  account_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_store_events_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
