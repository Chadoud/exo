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
