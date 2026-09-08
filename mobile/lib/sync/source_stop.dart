import 'dart:convert';

import 'local_store.dart';
import 'sync_crypto.dart';
import 'sync_engine.dart';
import 'task_payload.dart';
import 'task_source_forget.dart';

enum SourceStopPhase { ready, waiting, paused }

Future<bool> hasSourceForgetCapability(LocalBrainStore store) async {
  final row = await store.readRecord(
    collection: tasksCollection,
    recordId: sourceForgetCapabilityId,
  );
  return row != null && !LocalBrainStore.rowIsPendingDelete(row);
}

SourceStopPhase sourceStopPhaseFromRow(Map<String, dynamic>? row) {
  if (row == null) return SourceStopPhase.ready;
  if (LocalBrainStore.rowIsPendingDelete(row) ||
      (row['pending_push'] as int?) == 1) {
    return SourceStopPhase.waiting;
  }
  if (taskPayloadOf(row)['stop_state']?.toString() == 'waiting') {
    return SourceStopPhase.waiting;
  }
  return SourceStopPhase.paused;
}

Future<SourceStopPhase> sourceStopPhase(
  LocalBrainStore store,
  String source,
) async {
  return sourceStopPhaseFromRow(
    await store.readRecord(
      collection: tasksCollection,
      recordId: '$sourceForgetPrefix$source',
    ),
  );
}

/// Queue a list-stop. Hide the button only after the push succeeds.
Future<bool> queueSourceStop({
  required LocalBrainStore store,
  required SyncEngine engine,
  required String source,
  required String deviceId,
}) async {
  if (!forgettableTaskSources.contains(source)) return false;
  final now = DateTime.now().toUtc().toIso8601String();
  final recordId = '$sourceForgetPrefix$source';
  final payload = jsonEncode({'forget_source': source});
  await store.applyLocalDelete(
    collection: tasksCollection,
    recordId: recordId,
    payloadJson: payload,
    updatedAt: now,
    logicalClock: SyncCrypto.logicalClock(now, recordId),
    deviceId: deviceId,
  );
  try {
    await engine.pushPendingEdits();
  } catch (_) {
    await store.deleteRecord(collection: tasksCollection, recordId: recordId);
    return false;
  }
  final leftover = await store.readRecord(
    collection: tasksCollection,
    recordId: recordId,
  );
  if (leftover != null &&
      ((leftover['pending_push'] as int?) == 1 ||
          LocalBrainStore.rowIsPendingDelete(leftover))) {
    await store.deleteRecord(collection: tasksCollection, recordId: recordId);
    return false;
  }
  await store.upsertRecord(
    collection: tasksCollection,
    recordId: recordId,
    payloadJson: jsonEncode({
      'forget_source': source,
      'stop_state': 'waiting',
    }),
    updatedAt: now,
  );
  await applyTaskSourceForget(
    store: store,
    payload: {'forget_source': source},
    updatedAt: now,
  );
  return true;
}
