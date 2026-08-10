-- Admin action audit trail: every mutating support action records who did
-- what to whom. Rows are written in the same transaction as the change.

CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_account_id CHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_account_id CHAR(36) NOT NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_audit_target (target_account_id, created_at),
  KEY idx_admin_audit_admin (admin_account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
