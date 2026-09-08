import 'dart:convert';

/// Shared task payload helpers (UI + local edit — keep in sync with desktop).
bool taskPayloadIsCompleted(Map<String, dynamic> payload) {
  final v = payload['completed'];
  if (v is bool) return v;
  if (v is num) return v != 0;
  return v?.toString() == 'true' || v?.toString() == '1';
}

Map<String, dynamic> taskPayloadOf(Map<String, dynamic> row) {
  try {
    return jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
  } catch (_) {
    return {};
  }
}

String? taskRecordIdOf(Map<String, dynamic> row) {
  final id = row['record_id']?.toString();
  if (id == null || id.isEmpty) return null;
  return id;
}

/// Incomplete first, then due date, then newest updated.
int compareTaskRows(Map<String, dynamic> a, Map<String, dynamic> b) {
  final pa = taskPayloadOf(a);
  final pb = taskPayloadOf(b);
  final ca = taskPayloadIsCompleted(pa);
  final cb = taskPayloadIsCompleted(pb);
  if (ca != cb) return ca ? 1 : -1;
  final da = DateTime.tryParse(pa['due_at']?.toString() ?? '');
  final db = DateTime.tryParse(pb['due_at']?.toString() ?? '');
  if (da != null && db != null) {
    final c = da.compareTo(db);
    if (c != 0) return c;
  } else if (da != null) {
    return -1;
  } else if (db != null) {
    return 1;
  }
  final ua = a['updated_at']?.toString() ?? '';
  final ub = b['updated_at']?.toString() ?? '';
  return ub.compareTo(ua);
}
