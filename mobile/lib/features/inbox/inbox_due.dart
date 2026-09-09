import '../../sync/pending_action_payload.dart';
import '../../sync/task_payload.dart';
import '../tasks/task_due_label.dart';

/// Day delta for an Inbox mail card — own `due_at` or the joined task.
int? inboxDueDaysFor(
  Map<String, dynamic> payload, {
  required Map<String, int> taskDueById,
  required DateTime now,
}) {
  final own = taskDueDayDelta(payload, now: now);
  if (own != null) return own;
  final tid = pendingActionTaskRecordId(payload);
  if (tid.isEmpty) return null;
  return taskDueById[tid];
}

Map<String, int> taskDueDaysByRecordId(
  Iterable<Map<String, dynamic>> taskRows, {
  required DateTime now,
}) {
  final out = <String, int>{};
  for (final row in taskRows) {
    final id = taskRecordIdOf(row);
    if (id == null) continue;
    final days = taskDueDayDelta(taskPayloadOf(row), now: now);
    if (days != null) out[id] = days;
  }
  return out;
}
