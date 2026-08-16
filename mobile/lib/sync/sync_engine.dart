import 'dart:convert';
import 'dart:typed_data';

import 'cloud_api.dart';
import 'key_value_store.dart';
import 'local_store.dart';
import 'pairing_payload.dart';
import 'sync_crypto.dart';
import 'sync_errors.dart';

/// Result of pulling until the relay reports no more pages.
class SyncPullResult {
  const SyncPullResult({
    required this.appliedCount,
    required this.deletedCount,
    required this.cursor,
  });

  final int appliedCount;
  final int deletedCount;
  final int cursor;
}

/// Mobile GO SYNC engine — pull encrypted blobs, decrypt, cache locally.
class SyncEngine {
  SyncEngine({
    required this.cloudUrl,
    required this.accessToken,
    required this.deviceId,
    required CloudApi api,
    required KeyValueStore storage,
    LocalBrainStore? localStore,
  })  : _api = api,
        _storage = storage,
        _localStore = localStore ?? LocalBrainStore();

  final String cloudUrl;
  final String accessToken;
  final String deviceId;
  final CloudApi _api;
  final KeyValueStore _storage;
  final LocalBrainStore _localStore;

  static const _masterKeyKey = 'exosites_sync_master_key_b64';
  static const cursorStorageKey = 'sync_pull_cursor';
  static const feedVersionKey = 'sync_feed_version';
  static const expectedFeedVersion = '1';

  LocalBrainStore get localStore => _localStore;

  String? get _accountId => accountIdFromAccessToken(accessToken);

  Future<Uint8List> masterKey() async {
    final b64 = await _storage.read(_masterKeyKey);
    if (b64 == null || b64.isEmpty) {
      throw SyncNotPairedException();
    }
    final bytes = base64Decode(b64);
    if (bytes.length != SyncCrypto.keyLength) {
      throw SyncNotPairedException();
    }
    return Uint8List.fromList(bytes);
  }

  Future<int> readCursor() async {
    final raw = await _storage.read(cursorStorageKey);
    if (raw == null || raw.isEmpty) return 0;
    return int.tryParse(raw) ?? 0;
  }

  Future<void> writeCursor(int cursor) async {
    await _storage.write(cursorStorageKey, '$cursor');
  }

  Future<void> clearCursor() async {
    await _storage.delete(cursorStorageKey);
  }

  /// One-shot migration: legacy blob-id cursors are invalid for change_seq feed.
  Future<void> ensureFeedVersion() async {
    final ver = await _storage.read(feedVersionKey);
    if (ver == expectedFeedVersion) return;
    await clearCursor();
    try {
      await _localStore.clearAll();
    } catch (_) {}
    await _storage.write(feedVersionKey, expectedFeedVersion);
  }

  Future<void> _fullResyncLocal() async {
    await clearCursor();
    try {
      await _localStore.clearAll();
    } catch (_) {}
  }

  Future<List<Map<String, dynamic>>> _decryptBlobs(List<Map<String, dynamic>> blobs) async {
    final mk = await masterKey();
    final decoded = <Map<String, dynamic>>[];
    for (final env in blobs) {
      final schemaVersion = (env['schema_version'] as num?)?.toInt() ?? SyncCrypto.schemaV1;
      if (schemaVersion > SyncCrypto.maxSupportedSchema) {
        throw SyncSchemaException();
      }
      try {
        decoded.add(await _decryptEnvelope(env, mk));
      } on SyncSchemaException {
        rethrow;
      } catch (_) {
        throw SyncDecryptException();
      }
    }
    return decoded;
  }

  Future<Map<String, dynamic>> pullAndDecrypt({
    int cursor = 0,
    int snapshotOffset = 0,
  }) async {
    final pulled = await _api.pullBlobs(cursor: cursor, snapshotOffset: snapshotOffset);
    final blobs = (pulled['blobs'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    final decoded = await _decryptBlobs(blobs);
    return {
      'records': decoded,
      'cursor': pulled['cursor'] ?? cursor,
      'has_more': pulled['has_more'] ?? false,
      'resync_required': pulled['resync_required'] == true,
      'snapshot': pulled['snapshot'] == true,
      'snapshot_offset': (pulled['snapshot_offset'] as num?)?.toInt() ?? 0,
      'resume_cursor': (pulled['resume_cursor'] as num?)?.toInt(),
    };
  }

  Future<({int applied, int deleted})> _applyRecords(List<Map<String, dynamic>> records) async {
    var applied = 0;
    var deleted = 0;
    for (final row in records) {
      final collection = row['collection'] as String;
      final recordId = row['record_id'] as String;
      final logicalClock = (row['logical_clock'] as num?)?.toInt() ?? 0;
      final rowDevice = (row['device_id'] as String?) ?? '';
      final prev = await _localStore.readRevision(
        collection: collection,
        recordId: recordId,
      );
      if (prev != null) {
        if (logicalClock < prev.logicalClock) continue;
        if (logicalClock == prev.logicalClock && rowDevice.compareTo(prev.deviceId) < 0) {
          continue;
        }
      }
      if (row['deleted'] == true) {
        await _localStore.deleteRecord(collection: collection, recordId: recordId);
        deleted++;
        continue;
      }
      await _localStore.upsertRecord(
        collection: collection,
        recordId: recordId,
        payloadJson: jsonEncode(row['payload']),
        updatedAt: row['updated_at'] as String?,
        logicalClock: logicalClock,
        deviceId: rowDevice,
      );
      applied++;
    }
    return (applied: applied, deleted: deleted);
  }

  /// Pull all pages, apply upserts/deletes, persist cursor.
  Future<SyncPullResult> pullUntilCaughtUp() async {
    await ensureFeedVersion();
    var cursor = await readCursor();
    var applied = 0;
    var deleted = 0;
    var guard = 0;
    var snapshotOffset = 0;
    var clearedForSnapshot = false;
    while (true) {
      if (++guard > 500) break;
      final page = await pullAndDecrypt(cursor: cursor, snapshotOffset: snapshotOffset);
      if (page['resync_required'] == true) {
        if (!clearedForSnapshot) {
          await _fullResyncLocal();
          clearedForSnapshot = true;
        }
        final batch = await _applyRecords(
          (page['records'] as List).cast<Map<String, dynamic>>(),
        );
        applied += batch.applied;
        deleted += batch.deleted;
        if (page['has_more'] == true) {
          snapshotOffset = (page['snapshot_offset'] as num?)?.toInt() ?? snapshotOffset;
          continue;
        }
        cursor = (page['resume_cursor'] as num?)?.toInt() ?? 0;
        await writeCursor(cursor);
        snapshotOffset = 0;
        clearedForSnapshot = false;
        // Resume change feed after snapshot watermark.
        continue;
      }
      final batch = await _applyRecords(
        (page['records'] as List).cast<Map<String, dynamic>>(),
      );
      applied += batch.applied;
      deleted += batch.deleted;
      cursor = (page['cursor'] as num?)?.toInt() ?? cursor;
      await writeCursor(cursor);
      if (page['has_more'] != true) break;
    }
    return SyncPullResult(appliedCount: applied, deletedCount: deleted, cursor: cursor);
  }

  Future<Map<String, dynamic>> pushLocalRecords(List<Map<String, dynamic>> items) async {
    final mk = await masterKey();
    final envelopes = <Map<String, dynamic>>[];
    for (final item in items) {
      envelopes.add(await _encryptItem(item, mk));
    }
    if (envelopes.isEmpty) {
      return {'accepted': 0, 'cursor': 0};
    }
    return _api.pushBlobs(envelopes);
  }

  /// Push queued local edits (e.g. task completion), then unflag them.
  ///
  /// Drains every page ([pageSize], default 100). Rows edited again mid-push
  /// keep their flag (clock guard in the store).
  Future<int> pushPendingEdits({int pageSize = 100}) async {
    var total = 0;
    for (var i = 0; i < 50; i++) {
      final n = await _pushPendingPage(pageSize);
      if (n == 0) return total;
      total += n;
    }
    return total;
  }

  Future<int> _pushPendingPage(int pageSize) async {
    final rows = await _localStore.listPendingPush(limit: pageSize);
    if (rows.isEmpty) return 0;
    final items = <Map<String, dynamic>>[];
    for (final row in rows) {
      items.add({
        'collection': row['collection'],
        'record_id': row['record_id'],
        'updated_at': row['updated_at'],
        'payload': jsonDecode(row['payload_json'] as String),
        'deleted': LocalBrainStore.rowIsPendingDelete(row),
      });
    }
    await pushLocalRecords(items);
    for (final row in rows) {
      final collection = row['collection'] as String;
      final recordId = row['record_id'] as String;
      final clock = (row['logical_clock'] as num?)?.toInt() ?? 0;
      await _localStore.clearPendingPush(
        collection: collection,
        recordId: recordId,
        logicalClock: clock,
      );
      if (LocalBrainStore.rowIsPendingDelete(row)) {
        await _localStore.deleteRecord(collection: collection, recordId: recordId);
      }
    }
    return rows.length;
  }

  Future<Map<String, dynamic>> _encryptItem(Map<String, dynamic> item, Uint8List mk) async {
    final collection = item['collection'] as String;
    final recordId = item['record_id'] as String;
    final updatedAt = item['updated_at'] as String;
    final payload = utf8.encode(jsonEncode(item['payload']));
    final rkey = await SyncCrypto.recordKey(mk, collection, recordId);
    final accountId = _accountId;
    if (accountId == null) throw SyncAuthException('account_id missing');
    return SyncCrypto.buildEnvelope(
      collection: collection,
      recordId: recordId,
      deviceId: deviceId,
      logicalClock: SyncCrypto.logicalClock(updatedAt, recordId),
      updatedAt: updatedAt,
      plaintext: Uint8List.fromList(payload),
      recordKey: rkey,
      deleted: item['deleted'] == true,
      accountId: accountId,
    );
  }

  Future<Map<String, dynamic>> _decryptEnvelope(Map<String, dynamic> env, Uint8List mk) async {
    final collection = env['collection'] as String;
    final recordId = env['record_id'] as String;
    final deviceId = (env['device_id'] as String?) ?? '';
    final logicalClock = (env['logical_clock'] as num?)?.toInt() ?? 0;
    final deleted = env['deleted'] == true;
    final schemaVersion = (env['schema_version'] as num?)?.toInt() ?? SyncCrypto.schemaV1;
    if (schemaVersion > SyncCrypto.maxSupportedSchema) {
      throw SyncSchemaException();
    }
    // Legacy v1 tombstones are not AEAD-bound — ignore delete flag until v2+ re-push.
    final effectiveDeleted = schemaVersion >= SyncCrypto.schemaV2 && deleted;
    final rkey = await SyncCrypto.recordKey(mk, collection, recordId);
    List<int>? aad;
    if (schemaVersion >= SyncCrypto.schemaV2) {
      final accountId = schemaVersion >= SyncCrypto.schemaV3 ? _accountId : null;
      if (schemaVersion >= SyncCrypto.schemaV3 && (accountId == null || accountId.isEmpty)) {
        throw SyncAuthException('account_id missing');
      }
      aad = SyncCrypto.aadBytes(
        collection: collection,
        recordId: recordId,
        deviceId: deviceId,
        logicalClock: logicalClock,
        deleted: deleted,
        schemaVersion: schemaVersion,
        accountId: accountId,
      );
    }
    final plain = await SyncCrypto.decryptRecord(
      env['ciphertext'] as String,
      rkey,
      aad: aad,
    );
    return {
      'collection': collection,
      'record_id': recordId,
      'device_id': deviceId,
      'logical_clock': logicalClock,
      'payload': plain.isEmpty ? <String, dynamic>{} : jsonDecode(utf8.decode(plain)),
      'deleted': effectiveDeleted,
      'updated_at': env['updated_at'] as String?,
    };
  }
}
