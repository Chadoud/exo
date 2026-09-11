-- EXO cloud API — MariaDB schema (Infomaniak shared hosting).
-- Run once via phpMyAdmin or: mysql -u USER -p DATABASE < schema.sql

CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  first_name VARCHAR(120) NULL,
  last_name VARCHAR(120) NULL,
  -- Nullable: social-only accounts (Google/Apple) have no password.
  password_hash VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  trial_ends_at DATETIME NULL,
  store_billing_exempt TINYINT(1) NOT NULL DEFAULT 0,
  refresh_token_jti CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linked sign-in identities. One account may have password + google + apple.
CREATE TABLE IF NOT EXISTS auth_identities (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email_at_link VARCHAR(320) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_identity_provider_subject (provider, provider_subject),
  KEY idx_identity_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-use codes handed to the desktop app after a social sign-in completes.
CREATE TABLE IF NOT EXISTS auth_exchange_codes (
  code_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exchange_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  -- Legacy byte meter; trial/licensing gates access now. Kept for schema compatibility.
  bytes_balance BIGINT NOT NULL DEFAULT 0,
  KEY idx_wallets_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entitlements (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  feature VARCHAR(64) NOT NULL,
  source VARCHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  extra TEXT NULL,
  KEY idx_entitlements_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  account_id CHAR(36) NOT NULL PRIMARY KEY,
  display_name VARCHAR(120) NULL,
  locale VARCHAR(16) NULL DEFAULT 'en',
  work_role VARCHAR(64) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_subscriptions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NULL,
  platform VARCHAR(16) NOT NULL,
  store_original_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  current_period_end DATETIME NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 0,
  retired TINYINT(1) NOT NULL DEFAULT 0,
  last_event_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_identity (platform, store_original_id),
  KEY idx_store_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_events_processed (
  event_id VARCHAR(255) NOT NULL PRIMARY KEY,
  provider VARCHAR(16) NOT NULL,
  event_type VARCHAR(64) NULL,
  account_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_store_events_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opt-in crash reports. Previously lived in a separate DB; consolidated here so the
-- Node API is the single server-side owner of database credentials.
CREATE TABLE IF NOT EXISTS crash_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  app_version VARCHAR(64) NOT NULL,
  environment VARCHAR(32) NOT NULL,
  ui_locale VARCHAR(32) NULL,
  platform VARCHAR(512) NULL,
  source VARCHAR(32) NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace LONGTEXT NULL,
  KEY idx_crash_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opt-in usage analytics (one row per event). See migrations/005_dashboard_views.sql for views.
CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  account_id CHAR(36) NULL,
  instance_id VARCHAR(128) NOT NULL,
  app_version VARCHAR(64) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  event_name VARCHAR(128) NOT NULL,
  event_props JSON NULL,
  client_ts_ms BIGINT NULL,
  KEY idx_tel_created (created_at),
  KEY idx_tel_event_day (event_name, created_at),
  KEY idx_tel_account (account_id),
  KEY idx_tel_app_version (app_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  account_id CHAR(36) NULL,
  instance_id VARCHAR(128) NOT NULL,
  app_version VARCHAR(64) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  category VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  KEY idx_fb_created (created_at),
  KEY idx_fb_category (category, created_at),
  KEY idx_fb_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
