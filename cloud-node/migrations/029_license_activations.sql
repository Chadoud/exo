-- Offline license activation tracking — first-use device binding.
-- The signed license (exo1.…) proves *validity* (signature, tier, seats) but
-- deliberately carries no machine_id — it's unknown at signing time, since
-- the client just pastes a key with no prior ID exchange. This table is what
-- actually enforces "max_seats devices per license_id", recorded the first
-- time each device successfully calls POST /v1/licenses/activate.
-- Reverse: DROP TABLE license_activations;

CREATE TABLE IF NOT EXISTS license_activations (
  license_id CHAR(36) NOT NULL,
  machine_id CHAR(64) NOT NULL,
  activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (license_id, machine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
