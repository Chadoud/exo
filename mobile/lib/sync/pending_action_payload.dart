import 'dart:convert';

const pendingActionsCollection = 'pending_actions';

bool pendingActionIsReady(Map<String, dynamic> payload) {
  return payload['status']?.toString() == 'ready';
}

bool pendingActionIsConfirmed(Map<String, dynamic> payload) {
  return payload['status']?.toString() == 'confirmed';
}

Map<String, dynamic> pendingActionPayloadOf(Map<String, dynamic> row) {
  final raw = row['payload_json'];
  if (raw is Map<String, dynamic>) return raw;
  if (raw is String && raw.isNotEmpty) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
    } catch (_) {}
  }
  return {};
}

String pendingActionTitle(Map<String, dynamic> payload) {
  final subject = payload['subject']?.toString().trim() ?? '';
  if (subject.isNotEmpty) return subject;
  return 'Ready to review';
}

String pendingActionInboundSubject(Map<String, dynamic> payload) {
  return payload['inbound_subject']?.toString().trim() ?? '';
}

String pendingActionInboundSnippet(Map<String, dynamic> payload) {
  return payload['inbound_snippet']?.toString().trim() ?? '';
}

String pendingActionTaskRecordId(Map<String, dynamic> payload) {
  return payload['task_record_id']?.toString().trim() ?? '';
}

/// Pending-action record_id joined to a task, if the desktop export sent one.
String? pendingRecordIdForTask(
  Iterable<Map<String, dynamic>> rows,
  String taskRecordId,
) {
  final want = taskRecordId.trim();
  if (want.isEmpty) return null;
  for (final row in rows) {
    final payload = pendingActionPayloadOf(row);
    if (pendingActionTaskRecordId(payload) != want) continue;
    final id = row['record_id']?.toString().trim() ?? '';
    if (id.isNotEmpty) return id;
  }
  return null;
}

int countReadyPendingActions(Iterable<Map<String, dynamic>> rows) {
  var n = 0;
  for (final row in rows) {
    if (pendingActionIsReady(pendingActionPayloadOf(row))) n++;
  }
  return n;
}
