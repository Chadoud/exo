const { getPool } = require("./db");

/**
 * Idempotently records a device activation for a license, enforcing `maxSeats`.
 * Re-activating the same (license_id, machine_id) pair (reinstall, etc.) is
 * always allowed and doesn't consume an extra seat.
 *
 * @param {string} licenseId
 * @param {string} machineId
 * @param {number} maxSeats
 * @returns {Promise<{ ok: true } | { ok: false, reason: "seat_limit" }>}
 */
async function activateDevice(licenseId, machineId, maxSeats) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      "SELECT 1 FROM license_activations WHERE license_id = ? AND machine_id = ? LIMIT 1",
      [licenseId, machineId],
    );
    if (existing.length > 0) {
      await conn.commit();
      return { ok: true };
    }
    // FOR UPDATE takes a gap lock on this license_id's index range, so a
    // concurrent activation for the same license_id blocks until we commit —
    // otherwise two simultaneous first-activations could both slip past a
    // COUNT(*) < maxSeats check.
    const [countRows] = await conn.execute(
      "SELECT COUNT(*) AS n FROM license_activations WHERE license_id = ? FOR UPDATE",
      [licenseId],
    );
    const activeSeats = Number(countRows[0]?.n || 0);
    if (activeSeats >= maxSeats) {
      await conn.rollback();
      return { ok: false, reason: "seat_limit" };
    }
    await conn.execute("INSERT INTO license_activations (license_id, machine_id) VALUES (?, ?)", [
      licenseId,
      machineId,
    ]);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { activateDevice };
