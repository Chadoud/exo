import 'local_store.dart';
import 'inbox_payload.dart';
import 'sync_crypto.dart';

/// Queue a dismiss tombstone. Mail replies stay on the confirm path.
Future<bool> applyInboxDismiss({
  required LocalBrainStore store,
  required String collection,
  required String recordId,
  required String now,
  required String deviceId,
}) async {
  if (collection != nudgesCollection && collection != agentFailuresCollection) {
    return false;
  }
  if (recordId.isEmpty) return false;
  final row = await store.readRecord(collection: collection, recordId: recordId);
  if (row == null || LocalBrainStore.rowIsPendingDelete(row)) return false;
  await store.applyLocalDelete(
    collection: collection,
    recordId: recordId,
    payloadJson: '{}',
    updatedAt: now,
    logicalClock: SyncCrypto.logicalClock(now, recordId),
    deviceId: deviceId,
  );
  return true;
}
