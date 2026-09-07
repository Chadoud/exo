import 'dart:convert';

import '../sync/task_payload.dart';

/// iOS pending-notification budget is ~64; keep well under that.
const kMaxScheduledDueReminders = 20;

/// One local OS notification to schedule for a synced task.
class DueReminderPlan {
  const DueReminderPlan({
    required this.recordId,
    required this.fireAt,
    required this.title,
    required this.body,
  });

  final String recordId;
  final DateTime fireAt;
  final String title;
  final String body;
}

/// Parse task `due_at`. Aware ISO → local instant. Naive ISO → device-local clock.
DateTime? parseTaskDueAt(String? raw) {
  final text = raw?.trim() ?? '';
  if (text.isEmpty) return null;
  final parsed = DateTime.tryParse(text);
  if (parsed == null) return null;
  if (parsed.isUtc) return parsed.toLocal();
  return parsed;
}

int notificationIdFor(String recordId) {
  var hash = 0;
  for (final unit in recordId.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return hash == 0 ? 1 : hash;
}

/// Incomplete tasks with a future due, soonest first, capped.
List<DueReminderPlan> planDueReminders({
  required List<Map<String, dynamic>> rows,
  required DateTime now,
  required bool showLockScreenDetail,
  required String genericTitle,
  required String genericBody,
  int cap = kMaxScheduledDueReminders,
}) {
  final nowLocal = now.toLocal();
  final planned = <DueReminderPlan>[];
  for (final row in rows) {
    final plan = _planRow(
      row,
      nowLocal: nowLocal,
      showLockScreenDetail: showLockScreenDetail,
      genericTitle: genericTitle,
      genericBody: genericBody,
    );
    if (plan != null) planned.add(plan);
  }
  planned.sort((a, b) => a.fireAt.compareTo(b.fireAt));
  if (planned.length <= cap) return planned;
  return planned.sublist(0, cap);
}

DueReminderPlan? _planRow(
  Map<String, dynamic> row, {
  required DateTime nowLocal,
  required bool showLockScreenDetail,
  required String genericTitle,
  required String genericBody,
}) {
  final recordId = row['record_id']?.toString() ?? '';
  if (recordId.isEmpty) return null;
  final payload = _payloadOf(row);
  if (taskPayloadIsCompleted(payload)) return null;
  final due = parseTaskDueAt(payload['due_at']?.toString());
  if (due == null || !due.isAfter(nowLocal)) return null;
  final description = payload['description']?.toString().trim() ?? '';
  final useDetail = showLockScreenDetail && description.isNotEmpty;
  return DueReminderPlan(
    recordId: recordId,
    fireAt: due,
    title: useDetail ? _clipTitle(description) : genericTitle,
    body: genericBody,
  );
}

Map<String, dynamic> _payloadOf(Map<String, dynamic> row) {
  final raw = row['payload'];
  if (raw is Map<String, dynamic>) return raw;
  final encoded = row['payload_json'];
  if (encoded is Map<String, dynamic>) return encoded;
  if (encoded is String && encoded.isNotEmpty) {
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is Map<String, dynamic>) return decoded;
    } catch (_) {}
  }
  return {};
}

String _clipTitle(String text) {
  if (text.length <= 80) return text;
  return '${text.substring(0, 80)}…';
}
