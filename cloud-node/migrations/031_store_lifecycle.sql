-- Store lifecycle: keep purchase identity after account deletion (retired),
-- so a receipt cannot entitle a second EXO account.
-- Reverse: ALTER TABLE store_subscriptions MODIFY account_id CHAR(36) NOT NULL;
--          ALTER TABLE store_subscriptions DROP COLUMN retired;
-- account_id NULL is applied in apply-migration-031.js when the column is still NOT NULL.

ALTER TABLE store_subscriptions
  ADD COLUMN IF NOT EXISTS retired TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_renew;
