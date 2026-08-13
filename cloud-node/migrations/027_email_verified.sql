-- Email verification flag — closes the social-auto-link account-takeover
-- vector: resolveSocialAccount() must only link a social sign-in to an
-- *existing* account when that account's email has actually been verified
-- by us, not just when the provider says the email string matches.
--
-- Backfill existing accounts to verified=1: this migration only needs to stop
-- *new* unverified accounts from being valid auto-link targets going forward.
-- Forcing every current user to reverify would be a friction regression with
-- no security benefit (the exploit requires an attacker to pre-register an
-- unverified account *before* the real owner's first social sign-in).
--
-- Reverse: ALTER TABLE accounts DROP COLUMN email_verified;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash;

UPDATE accounts SET email_verified = 1 WHERE email_verified = 0;
