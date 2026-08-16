/// Shared task payload helpers (UI + local edit — keep in sync with desktop).
bool taskPayloadIsCompleted(Map<String, dynamic> payload) {
  final v = payload['completed'];
  if (v is bool) return v;
  if (v is num) return v != 0;
  return v?.toString() == 'true' || v?.toString() == '1';
}
