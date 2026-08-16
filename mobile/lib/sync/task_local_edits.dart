import 'dart:convert';

import 'local_store.dart';
import 'sync_crypto.dart';
import 'task_payload.dart';

/// Flip completion on one cached task. False when unknown or already correct.
Future<bool> applyTaskCompletion({
  required LocalBrainStore store,
  required String recordId,
  required bool completed,
  required String now,
  required String deviceId,
}) async {
  final row = await store.readRecord(collection: 'tasks', recordId: recordId);
  if (row == null || LocalBrainStore.rowIsPendingDelete(row)) return false;
  Map<String, dynamic> payload;
  try {
    payload = jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
  } catch (_) {
    payload = <String, dynamic>{};
  }
  if (taskPayloadIsCompleted(payload) == completed) return false;
  payload['completed'] = completed;
  payload['completed_at'] = completed ? now : null;
  payload['updated_at'] = now;
  await store.applyLocalEdit(
    collection: 'tasks',
    recordId: recordId,
    payloadJson: jsonEncode(payload),
    updatedAt: now,
    logicalClock: SyncCrypto.logicalClock(now, recordId),
    deviceId: deviceId,
  );
  return true;
}

/// Queue a tombstone for one cached task. False when unknown or already removed.
Future<bool> applyTaskDelete({
  required LocalBrainStore store,
  required String recordId,
  required String now,
  required String deviceId,
}) async {
  final row = await store.readRecord(collection: 'tasks', recordId: recordId);
  if (row == null || LocalBrainStore.rowIsPendingDelete(row)) return false;
  await store.applyLocalDelete(
    collection: 'tasks',
    recordId: recordId,
    payloadJson: row['payload_json'] as String,
    updatedAt: now,
    logicalClock: SyncCrypto.logicalClock(now, recordId),
    deviceId: deviceId,
  );
  return true;
}
