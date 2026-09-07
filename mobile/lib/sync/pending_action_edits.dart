import 'dart:convert';

import 'local_store.dart';
import 'pending_action_payload.dart';
import 'sync_crypto.dart';

/// Queue a confirm write. Never stores a draft_token.
Future<bool> applyPendingActionConfirm({
  required LocalBrainStore store,
  required String recordId,
  required String subject,
  required String body,
  required String now,
  required String deviceId,
}) async {
  if (recordId.isEmpty || body.trim().isEmpty) return false;
  final row = await store.readRecord(
    collection: pendingActionsCollection,
    recordId: recordId,
  );
  if (row == null || LocalBrainStore.rowIsPendingDelete(row)) return false;
  final payload = pendingActionPayloadOf(row);
  if (!pendingActionIsReady(payload)) return false;
  payload['status'] = 'confirmed';
  payload['subject'] = subject.trim();
  payload['body'] = body.trim();
  payload['updated_at'] = now;
  payload.remove('draft_token');
  payload.remove('token');
  await store.applyLocalEdit(
    collection: pendingActionsCollection,
    recordId: recordId,
    payloadJson: jsonEncode(payload),
    updatedAt: now,
    logicalClock: SyncCrypto.logicalClock(now, recordId),
    deviceId: deviceId,
  );
  return true;
}
