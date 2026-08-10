const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { getPool } = require("./db");

const FEED_VERSION = 1;
const ALLOWED_COLLECTIONS = new Set([
  "memory_entries",
  "conversations",
  "tasks",
  "activity_entries",
]);
const MAX_CIPHERTEXT_CHARS = 2_000_000;
const PAIRING_GRANT_TTL_MS = 30 * 60 * 1000;
/** Keep at most this many change_seq rows per account (ops floor for resync). */
const CHANGE_FEED_KEEP = Math.max(
  1000,
  Number.parseInt(process.env.EXOSITES_SYNC_CHANGES_KEEP || "10000", 10) || 10000,
);
const MIN_SCHEMA = 2;
const MAX_SCHEMA = 3;

/**
 * Register a sync device for push notifications (optional token).
 * @param {string} accountId
 * @param {{ name: string; platform: string; pushToken?: string | null; deviceId?: string | null }} input
 */
async function registerDevice(accountId, input) {
  const pool = getPool();
  const id = input.deviceId || uuidv4();
  await pool.query(
    `INSERT INTO sync_devices (id, account_id, name, platform, push_token)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       platform = VALUES(platform),
       push_token = VALUES(push_token),
       updated_at = CURRENT_TIMESTAMP`,
    [id, accountId, input.name, input.platform, input.pushToken || null],
  );
  return { device_id: id, ok: true };
}

function validateBlob(blob) {
  const collection = String(blob.collection || "");
  const recordId = String(blob.record_id || "");
  if (!collection || !recordId) return { ok: false, reason: "missing_ids" };
  if (!ALLOWED_COLLECTIONS.has(collection)) return { ok: false, reason: "unknown_collection" };
  if (collection.length > 64 || recordId.length > 128) return { ok: false, reason: "field_too_long" };
  const ciphertext = String(blob.ciphertext || "");
  if (!ciphertext) return { ok: false, reason: "missing_ciphertext" };
  if (ciphertext.length > MAX_CIPHERTEXT_CHARS) return { ok: false, reason: "ciphertext_too_large" };
  const contentHash = String(blob.content_hash || "");
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) return { ok: false, reason: "bad_content_hash" };
  const schemaVersion = Number(blob.schema_version || 0);
  // Reject unauthenticated v1; accept v2–v3 (v3 binds account_id in client AAD).
  if (
    !Number.isFinite(schemaVersion) ||
    schemaVersion < MIN_SCHEMA ||
    schemaVersion > MAX_SCHEMA
  ) {
    return { ok: false, reason: "bad_schema_version" };
  }
  return {
    ok: true,
    envelope: {
      collection,
      record_id: recordId,
      device_id: String(blob.device_id || "").slice(0, 64),
      logical_clock: Number(blob.logical_clock || 0),
      updated_at: String(blob.updated_at || "").slice(0, 40),
      deleted: blob.deleted ? 1 : 0,
      schema_version: schemaVersion,
      ciphertext,
      content_hash: contentHash.toLowerCase(),
    },
  };
}

/** Deterministic LWW: higher clock wins; tie → lexicographic (device_id, updated_at, ciphertext). */
function isNewerOrEqual(next, prev) {
  if (!prev) return true;
  if (next.logical_clock > prev.logical_clock) return true;
  if (next.logical_clock < prev.logical_clock) return false;
  const a = `${next.device_id}\0${next.updated_at}\0${next.ciphertext}`;
  const b = `${prev.device_id}\0${prev.updated_at}\0${prev.ciphertext}`;
  return a >= b;
}

/**
 * Upsert encrypted blob envelopes and append immutable change snapshots.
 * @param {string} accountId
 * @param {object[]} blobs
 */
async function pushBlobs(accountId, blobs) {
  const pool = getPool();
  let accepted = 0;
  let rejected = 0;
  for (const blob of blobs) {
    const checked = validateBlob(blob);
    if (!checked.ok) {
      rejected += 1;
      continue;
    }
    const env = checked.envelope;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existingRows] = await conn.query(
        `SELECT logical_clock, device_id, updated_at, ciphertext
         FROM sync_blobs
         WHERE account_id = ? AND collection = ? AND record_id = ?
         LIMIT 1
         FOR UPDATE`,
        [accountId, env.collection, env.record_id],
      );
      const prev = existingRows[0] || null;
      if (prev && !isNewerOrEqual(env, prev)) {
        await conn.rollback();
        continue;
      }
      await conn.query(
        `INSERT INTO sync_blobs
          (account_id, collection, record_id, device_id, logical_clock, updated_at, deleted, schema_version, ciphertext, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           device_id = VALUES(device_id),
           logical_clock = VALUES(logical_clock),
           updated_at = VALUES(updated_at),
           deleted = VALUES(deleted),
           schema_version = VALUES(schema_version),
           ciphertext = VALUES(ciphertext),
           content_hash = VALUES(content_hash)`,
        [
          accountId,
          env.collection,
          env.record_id,
          env.device_id,
          env.logical_clock,
          env.updated_at,
          env.deleted,
          env.schema_version,
          env.ciphertext,
          env.content_hash,
        ],
      );
      const [changeResult] = await conn.query(
        `INSERT INTO sync_changes
          (account_id, collection, record_id, device_id, logical_clock, updated_at, deleted, schema_version, ciphertext, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          env.collection,
          env.record_id,
          env.device_id,
          env.logical_clock,
          env.updated_at,
          env.deleted,
          env.schema_version,
          env.ciphertext,
          env.content_hash,
        ],
      );
      await conn.commit();
      accepted += 1;
      void changeResult;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {
        /* ignore */
      }
      throw err;
    } finally {
      conn.release();
    }
  }
  const [rows] = await pool.query(
    "SELECT COALESCE(MAX(change_seq), 0) AS max_seq FROM sync_changes WHERE account_id = ?",
    [accountId],
  );
  const cursor = Number(rows[0]?.max_seq ?? 0);
  await pool.query(
    `INSERT INTO sync_cursors (account_id, cursor_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE cursor_value = GREATEST(cursor_value, VALUES(cursor_value))`,
    [accountId, cursor],
  );
  if (accepted > 0) {
    await compactSyncChanges(accountId).catch(() => {});
  }
  return { accepted, rejected, cursor, feed_version: FEED_VERSION };
}

/**
 * Drop old change rows past KEEP so the log stays bounded.
 * Clients whose cursor is below the new floor must full-resync.
 * @param {string} accountId
 */
async function compactSyncChanges(accountId) {
  const pool = getPool();
  const [maxRows] = await pool.query(
    "SELECT COALESCE(MAX(change_seq), 0) AS max_seq FROM sync_changes WHERE account_id = ?",
    [accountId],
  );
  const maxSeq = Number(maxRows[0]?.max_seq || 0);
  if (maxSeq <= CHANGE_FEED_KEEP) return { ok: true, deleted: 0 };
  const floor = maxSeq - CHANGE_FEED_KEEP;
  const [result] = await pool.query(
    "DELETE FROM sync_changes WHERE account_id = ? AND change_seq < ?",
    [accountId, floor],
  );
  return { ok: true, deleted: Number(result?.affectedRows || 0), resync_floor: floor };
}

function mapBlobRow(r, changeSeq) {
  return {
    collection: r.collection,
    record_id: r.record_id,
    device_id: r.device_id,
    logical_clock: Number(r.logical_clock),
    updated_at: r.updated_at,
    deleted: Boolean(r.deleted),
    schema_version: Number(r.schema_version),
    ciphertext: r.ciphertext,
    content_hash: r.content_hash,
    change_seq: changeSeq == null ? null : Number(changeSeq),
  };
}

/**
 * Pull change snapshots after cursor (change_seq).
 * When the cursor is behind compacted history, serve current `sync_blobs` pages
 * (`resync_required` + `snapshot`) then resume at max change_seq.
 * @param {string} accountId
 * @param {number} cursor
 * @param {number} limit
 * @param {number} [snapshotOffset]
 */
async function pullBlobs(accountId, cursor, limit, snapshotOffset = 0) {
  const pool = getPool();
  const after = Math.max(0, Number(cursor) || 0);
  const offset = Math.max(0, Number(snapshotOffset) || 0);
  const [floorRows] = await pool.query(
    "SELECT COALESCE(MIN(change_seq), 0) AS floor FROM sync_changes WHERE account_id = ?",
    [accountId],
  );
  const resyncFloor = Number(floorRows[0]?.floor || 0);
  const [maxRows] = await pool.query(
    "SELECT COALESCE(MAX(change_seq), 0) AS max_seq FROM sync_changes WHERE account_id = ?",
    [accountId],
  );
  const resumeCursor = Number(maxRows[0]?.max_seq || 0);

  // Cursor fell behind compacted history — rebuild from current blob state.
  if (after > 0 && resyncFloor > 0 && after < resyncFloor - 1) {
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM sync_blobs WHERE account_id = ?",
      [accountId],
    );
    const total = Number(countRows[0]?.total || 0);
    const [rows] = await pool.query(
      `SELECT collection, record_id, device_id, logical_clock, updated_at, deleted,
              schema_version, ciphertext, content_hash
       FROM sync_blobs
       WHERE account_id = ?
       ORDER BY collection ASC, record_id ASC
       LIMIT ? OFFSET ?`,
      [accountId, limit, offset],
    );
    const nextOffset = offset + rows.length;
    return {
      blobs: rows.map((r) => mapBlobRow(r, null)),
      cursor: after,
      has_more: nextOffset < total,
      feed_version: FEED_VERSION,
      resync_required: true,
      resync_floor: resyncFloor,
      snapshot: true,
      snapshot_offset: nextOffset,
      resume_cursor: resumeCursor,
    };
  }

  const [rows] = await pool.query(
    `SELECT change_seq, collection, record_id, device_id, logical_clock, updated_at, deleted,
            schema_version, ciphertext, content_hash
     FROM sync_changes
     WHERE account_id = ? AND change_seq > ?
     ORDER BY change_seq ASC
     LIMIT ?`,
    [accountId, after, limit],
  );
  const blobs = rows.map((r) => mapBlobRow(r, r.change_seq));
  const nextCursor = rows.length ? Number(rows[rows.length - 1].change_seq) : after;
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS remaining FROM sync_changes WHERE account_id = ? AND change_seq > ?",
    [accountId, nextCursor],
  );
  const hasMore = Number(countRows[0]?.remaining || 0) > 0;
  return {
    blobs,
    cursor: nextCursor,
    has_more: hasMore,
    feed_version: FEED_VERSION,
    resync_required: false,
    resync_floor: resyncFloor,
    snapshot: false,
  };
}

async function syncStatus(accountId) {
  const pool = getPool();
  const [blobRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM sync_blobs WHERE account_id = ?",
    [accountId],
  );
  const [deviceRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM sync_devices WHERE account_id = ?",
    [accountId],
  );
  return {
    ok: true,
    blob_count: Number(blobRows[0]?.total || 0),
    device_count: Number(deviceRows[0]?.total || 0),
    feed_version: FEED_VERSION,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function normalizeKeyFingerprint(fp) {
  const s = String(fp || "")
    .trim()
    .toLowerCase();
  return /^[a-f0-9]{64}$/.test(s) ? s : null;
}

/**
 * Create a short-lived pairing grant bound to account + master-key fingerprint.
 * @param {string} accountId
 * @param {string} keyFingerprint SHA-256 hex of raw 32-byte master key
 */
async function createPairingGrant(accountId, keyFingerprint) {
  const fp = normalizeKeyFingerprint(keyFingerprint);
  if (!fp) {
    const err = new Error("key_fingerprint_required");
    err.code = "key_fingerprint_required";
    throw err;
  }
  const pool = getPool();
  const id = uuidv4();
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + PAIRING_GRANT_TTL_MS);
  await pool.query(
    `INSERT INTO sync_pairing_grants (id, account_id, token_hash, key_fingerprint, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, accountId, hashToken(token), fp, expires],
  );
  return {
    ok: true,
    grant_id: id,
    account_id: accountId,
    grant_token: token,
    expires_at: expires.toISOString(),
  };
}

/**
 * Redeem a pairing grant — JWT account + key fingerprint must match; single-use.
 * @param {string} accountId
 * @param {string} grantToken
 * @param {string} keyFingerprint
 */
async function redeemPairingGrant(accountId, grantToken, keyFingerprint) {
  const fp = normalizeKeyFingerprint(keyFingerprint);
  if (!fp) {
    return { ok: false, error: "key_fingerprint_required" };
  }
  const pool = getPool();
  const tokenHash = hashToken(grantToken);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, account_id, key_fingerprint, expires_at, redeemed_at
       FROM sync_pairing_grants
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, error: "invalid_grant" };
    }
    if (String(row.account_id) !== String(accountId)) {
      await conn.rollback();
      return { ok: false, error: "account_mismatch" };
    }
    if (String(row.key_fingerprint || "").toLowerCase() !== fp) {
      await conn.rollback();
      return { ok: false, error: "key_mismatch" };
    }
    if (row.redeemed_at) {
      await conn.rollback();
      return { ok: false, error: "already_redeemed" };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await conn.rollback();
      return { ok: false, error: "expired" };
    }
    await conn.query(
      "UPDATE sync_pairing_grants SET redeemed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [row.id],
    );
    await conn.commit();
    return { ok: true, account_id: accountId };
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  registerDevice,
  pushBlobs,
  pullBlobs,
  syncStatus,
  createPairingGrant,
  redeemPairingGrant,
  compactSyncChanges,
  FEED_VERSION,
  ALLOWED_COLLECTIONS,
  CHANGE_FEED_KEEP,
};
