-- Stripe billing — customer mapping, subscription state, webhook idempotency.
-- Safe to re-apply (IF NOT EXISTS guards; dedupe before unique key).
-- Reverse: ALTER TABLE accounts DROP COLUMN stripe_customer_id;
--          DROP TABLE subscriptions; DROP TABLE stripe_events_processed;
--          ALTER TABLE entitlements DROP KEY uq_entitlements_account_feature_source;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) NULL AFTER trial_ends_at;

ALTER TABLE accounts
  ADD UNIQUE KEY IF NOT EXISTS uq_accounts_stripe_customer (stripe_customer_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL,
  -- Stripe status: active | trialing | past_due | canceled | unpaid | incomplete | incomplete_expired
  status VARCHAR(32) NOT NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  -- Epoch seconds of the newest Stripe event applied — guards out-of-order webhook delivery.
  last_event_created BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subscriptions_stripe_id (stripe_subscription_id),
  KEY idx_subscriptions_account (account_id),
  CONSTRAINT fk_subscriptions_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stripe_events_processed (
  stripe_event_id VARCHAR(255) NOT NULL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  account_id CHAR(36) NULL,
  processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dedupe entitlements before adding the unique key the webhook upsert relies on.
-- Keeps the lowest id per (account_id, feature, source).
DELETE e1 FROM entitlements e1
INNER JOIN entitlements e2
  ON e1.account_id = e2.account_id
 AND e1.feature = e2.feature
 AND e1.source = e2.source
 AND e1.id > e2.id;

ALTER TABLE entitlements
  ADD UNIQUE KEY IF NOT EXISTS uq_entitlements_account_feature_source (account_id, feature, source);
