/// `exosites://tasks/{recordId}` — OAuth stays `exosites://oauth`.
String? taskRecordIdFromUri(Uri uri) {
  if (uri.scheme != 'exosites') return null;
  if (uri.host != 'tasks') return null;
  if (uri.pathSegments.isEmpty) return null;
  final id = uri.pathSegments.first.trim();
  return id.isEmpty ? null : id;
}

/// Tasks tab (due or pending actions). `exosites://actions/{id}` has no task id.
bool opensTasksFromUri(Uri uri) {
  if (uri.scheme != 'exosites') return false;
  return uri.host == 'tasks' || uri.host == 'actions';
}
