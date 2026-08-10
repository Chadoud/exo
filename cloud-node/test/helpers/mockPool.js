/** In-memory MySQL pool mock for sync relay unit tests. */

function createSyncMockPool() {
  /** @type {Map<string, object>} */
  const blobs = new Map();
  /** @type {Map<string, object>} */
  const devices = new Map();
  /** @type {Map<string, number>} */
  const cursors = new Map();
  /** @type {object[]} */
  const changes = [];
  /** @type {Map<string, object>} */
  const grants = new Map();
  let changeSeq = 0;

  function blobKey(accountId, collection, recordId) {
    return `${accountId}:${collection}:${recordId}`;
  }

  async function query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into sync_devices")) {
      const [id, accountId, name, platform, pushToken] = params;
      devices.set(id, { id, accountId, name, platform, pushToken });
      return [{ affectedRows: 1 }];
    }

    if (normalized.includes("from sync_blobs") && normalized.includes("for update")) {
      const [accountId, collection, recordId] = params;
      const existing = blobs.get(blobKey(accountId, collection, recordId));
      return [existing ? [existing] : []];
    }

    if (normalized.startsWith("insert into sync_blobs")) {
      const [
        accountId,
        collection,
        recordId,
        deviceId,
        logicalClock,
        updatedAt,
        deleted,
        schemaVersion,
        ciphertext,
        contentHash,
      ] = params;
      const key = blobKey(accountId, collection, recordId);
      blobs.set(key, {
        account_id: accountId,
        collection,
        record_id: recordId,
        device_id: deviceId,
        logical_clock: Number(logicalClock),
        updated_at: updatedAt,
        deleted: Boolean(deleted),
        schema_version: Number(schemaVersion),
        ciphertext,
        content_hash: contentHash,
      });
      return [{ affectedRows: 1 }];
    }

    if (normalized.startsWith("insert into sync_changes")) {
      const [
        accountId,
        collection,
        recordId,
        deviceId,
        logicalClock,
        updatedAt,
        deleted,
        schemaVersion,
        ciphertext,
        contentHash,
      ] = params;
      changeSeq += 1;
      changes.push({
        change_seq: changeSeq,
        account_id: accountId,
        collection,
        record_id: recordId,
        device_id: deviceId,
        logical_clock: Number(logicalClock),
        updated_at: updatedAt,
        deleted: Boolean(deleted),
        schema_version: Number(schemaVersion),
        ciphertext,
        content_hash: contentHash,
      });
      return [{ insertId: changeSeq, affectedRows: 1 }];
    }

    if (normalized.includes("select coalesce(max(change_seq)")) {
      const [accountId] = params;
      let maxSeq = 0;
      for (const row of changes) {
        if (row.account_id === accountId) maxSeq = Math.max(maxSeq, row.change_seq);
      }
      return [[{ max_seq: maxSeq }]];
    }

    if (normalized.includes("select coalesce(min(change_seq)")) {
      const [accountId] = params;
      let minSeq = 0;
      for (const row of changes) {
        if (row.account_id === accountId) {
          minSeq = minSeq === 0 ? row.change_seq : Math.min(minSeq, row.change_seq);
        }
      }
      return [[{ floor: minSeq }]];
    }

    if (normalized.startsWith("delete from sync_changes")) {
      const [accountId, floor] = params;
      const before = changes.length;
      const kept = changes.filter(
        (row) => !(row.account_id === accountId && row.change_seq < floor),
      );
      changes.length = 0;
      changes.push(...kept);
      return [{ affectedRows: before - kept.length }];
    }

    if (normalized.startsWith("insert into sync_cursors")) {
      const [accountId, cursor] = params;
      const prev = cursors.get(accountId) || 0;
      cursors.set(accountId, Math.max(prev, Number(cursor)));
      return [{ affectedRows: 1 }];
    }

    if (
      normalized.includes("from sync_changes") &&
      normalized.includes("change_seq > ?") &&
      normalized.includes("limit ?")
    ) {
      const [accountId, cursor, limit] = params;
      const rows = changes
        .filter((b) => b.account_id === accountId && b.change_seq > cursor)
        .sort((a, b) => a.change_seq - b.change_seq)
        .slice(0, limit);
      return [rows];
    }

    if (normalized.includes("count(*) as remaining") && normalized.includes("sync_changes")) {
      const [accountId, nextCursor] = params;
      const remaining = changes.filter(
        (b) => b.account_id === accountId && b.change_seq > nextCursor,
      ).length;
      return [[{ remaining }]];
    }

    if (
      normalized.includes("from sync_blobs") &&
      normalized.includes("order by collection") &&
      normalized.includes("limit ?")
    ) {
      const [accountId, limit, offset] = params;
      const rows = [...blobs.values()]
        .filter((b) => b.account_id === accountId)
        .sort((a, b) =>
          `${a.collection}:${a.record_id}`.localeCompare(`${b.collection}:${b.record_id}`),
        )
        .slice(Number(offset) || 0, (Number(offset) || 0) + Number(limit));
      return [rows];
    }

    if (normalized.includes("count(*) as total from sync_blobs")) {
      const [accountId] = params;
      const total = [...blobs.values()].filter((b) => b.account_id === accountId).length;
      return [[{ total }]];
    }

    if (normalized.includes("count(*) as total from sync_devices")) {
      const [accountId] = params;
      const total = [...devices.values()].filter((d) => d.accountId === accountId).length;
      return [[{ total }]];
    }

    if (normalized.startsWith("insert into sync_pairing_grants")) {
      const [id, accountId, tokenHash, keyFingerprint, expiresAt] = params;
      grants.set(tokenHash, {
        id,
        account_id: accountId,
        token_hash: tokenHash,
        key_fingerprint: keyFingerprint,
        expires_at: expiresAt,
        redeemed_at: null,
      });
      return [{ affectedRows: 1 }];
    }

    if (normalized.includes("from sync_pairing_grants") && normalized.includes("for update")) {
      const [tokenHash] = params;
      const row = grants.get(tokenHash);
      return [row ? [row] : []];
    }

    if (normalized.startsWith("update sync_pairing_grants")) {
      const [id] = params;
      for (const g of grants.values()) {
        if (g.id === id) g.redeemed_at = new Date();
      }
      return [{ affectedRows: 1 }];
    }

    throw new Error(`mockPool: unhandled query: ${sql.slice(0, 100)}`);
  }

  const conn = {
    query,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  return {
    query,
    getConnection: async () => conn,
    blobs,
    devices,
    cursors,
    changes,
    grants,
  };
}

module.exports = { createSyncMockPool };
