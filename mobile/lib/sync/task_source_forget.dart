import 'local_store.dart';
import 'task_payload.dart';

const tasksCollection = 'tasks';
const sourceForgetPrefix = 'source_forget:';
const sourceForgetCapabilityId = 'capability:source_forget_v1';

const forgettableTaskSources = {
  'gmail',
  'google-calendar',
  'outlook',
  'outlook-calendar',
};

const protectedTaskSources = {
  'manual',
  'conversation',
  'meeting',
  'assistant',
  'chat',
  'auto',
};

bool isSyncControlTaskRecord(String recordId) {
  return recordId == sourceForgetCapabilityId ||
      recordId.startsWith(sourceForgetPrefix);
}

String? forgetSourceOf(Map<String, dynamic> payload) {
  final raw = payload['forget_source']?.toString().trim() ?? '';
  if (raw.isEmpty || !forgettableTaskSources.contains(raw)) return null;
  return raw;
}

bool isSourceForgetRecord({
  required String recordId,
  required bool deleted,
  required Map<String, dynamic> payload,
}) {
  if (!deleted) return false;
  final source = forgetSourceOf(payload);
  if (source == null) return false;
  return recordId == '$sourceForgetPrefix$source';
}

bool taskUpdatedBeforeForget(String? taskUpdated, String? forgetAt) {
  final forget = DateTime.tryParse(forgetAt ?? '');
  if (forget == null) return false;
  final task = DateTime.tryParse(taskUpdated ?? '');
  if (task == null) return true;
  return task.isBefore(forget);
}

Future<int> applyTaskSourceForgetIfMarker({
  required LocalBrainStore store,
  required String recordId,
  required bool deleted,
  required Map<String, dynamic> payload,
  String? updatedAt,
}) async {
  if (!isSourceForgetRecord(
    recordId: recordId,
    deleted: deleted,
    payload: payload,
  )) {
    return 0;
  }
  return applyTaskSourceForget(
    store: store,
    payload: payload,
    updatedAt: updatedAt,
  );
}

/// Drop leftover harvested tasks after desktop disconnects a mailbox/calendar.
Future<int> applyTaskSourceForget({
  required LocalBrainStore store,
  required Map<String, dynamic> payload,
  String? updatedAt,
}) async {
  final source = forgetSourceOf(payload);
  if (source == null) return 0;
  final rows = await store.listByCollection(tasksCollection, limit: 5000);
  var deleted = 0;
  for (final row in rows) {
    final id = row['record_id']?.toString() ?? '';
    if (id.isEmpty || id.startsWith(sourceForgetPrefix)) continue;
    final taskSource = taskPayloadOf(row)['source']?.toString().trim() ?? '';
    if (taskSource != source) continue;
    if (protectedTaskSources.contains(taskSource)) continue;
    if (!taskUpdatedBeforeForget(row['updated_at']?.toString(), updatedAt)) {
      continue;
    }
    await store.deleteRecord(collection: tasksCollection, recordId: id);
    deleted++;
  }
  return deleted;
}
