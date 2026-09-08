/// `exosites://tasks/{recordId}` — OAuth stays `exosites://oauth`.
String? taskRecordIdFromUri(Uri uri) {
  if (uri.scheme != 'exosites') return null;
  if (uri.host != 'tasks') return null;
  if (uri.pathSegments.isEmpty) return null;
  final id = uri.pathSegments.first.trim();
  return id.isEmpty ? null : id;
}

/// Due reminder → Tasks. `exosites://tasks` with no id still opens Tasks.
bool opensTasksFromUri(Uri uri) {
  if (uri.scheme != 'exosites') return false;
  return uri.host == 'tasks';
}

/// Action-ready wake → Inbox. `exosites://actions/{id}` has no task id.
bool opensInboxFromUri(Uri uri) {
  if (uri.scheme != 'exosites') return false;
  return uri.host == 'actions';
}

/// `exosites://actions/{recordId}` — empty path still opens Inbox.
String? inboxActionIdFromUri(Uri uri) {
  if (!opensInboxFromUri(uri)) return null;
  if (uri.pathSegments.isEmpty) return null;
  final id = uri.pathSegments.first.trim();
  return id.isEmpty ? null : id;
}
