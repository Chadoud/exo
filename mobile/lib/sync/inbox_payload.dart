import 'dart:convert';

import 'local_store.dart';
import 'pending_action_payload.dart';

const nudgesCollection = 'nudges';
const agentFailuresCollection = 'agent_failures';

/// Desktop hides this pointer once failures are listed; mobile always uses the
/// failures lane instead of a dead "review failed tasks" card.
final failedTasksNudgeTitle = RegExp(
  r'^Review recent failed tasks$',
  caseSensitive: false,
);

bool isFailedTasksNudge(Map<String, dynamic> payload) {
  final title = payload['title']?.toString().trim() ?? '';
  return failedTasksNudgeTitle.hasMatch(title);
}

List<Map<String, dynamic>> visibleInboxNudges(
  Iterable<Map<String, dynamic>> nudges,
) {
  return [
    for (final row in nudges)
      if (!isFailedTasksNudge(inboxPayloadOf(row))) row,
  ];
}

Map<String, dynamic> inboxPayloadOf(Map<String, dynamic> row) {
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

int countOpenNudges(Iterable<Map<String, dynamic>> rows) {
  var n = 0;
  for (final row in rows) {
    if (LocalBrainStore.rowIsPendingDelete(row)) continue;
    final payload = inboxPayloadOf(row);
    if (isFailedTasksNudge(payload)) continue;
    final title = payload['title']?.toString().trim() ?? '';
    final body = payload['body']?.toString().trim() ?? '';
    if (title.isNotEmpty || body.isNotEmpty) n++;
  }
  return n;
}

int countOpenFailures(Iterable<Map<String, dynamic>> rows) {
  var n = 0;
  for (final row in rows) {
    if (LocalBrainStore.rowIsPendingDelete(row)) continue;
    final payload = inboxPayloadOf(row);
    final goal = payload['goal']?.toString().trim() ?? '';
    final outcome = payload['outcome']?.toString().trim() ?? '';
    if (goal.isNotEmpty || outcome.isNotEmpty) n++;
  }
  return n;
}

int countInboxAttention({
  required Iterable<Map<String, dynamic>> pending,
  required Iterable<Map<String, dynamic>> nudges,
  required Iterable<Map<String, dynamic>> failures,
}) {
  return countReadyPendingActions(pending) +
      countOpenNudges(nudges) +
      countOpenFailures(failures);
}

Future<int> countInboxAttentionFromStore(LocalBrainStore store) async {
  bool keep(Map<String, dynamic> row) => !LocalBrainStore.rowIsPendingDelete(row);
  final pending = await store.listByCollection(pendingActionsCollection);
  final nudges = await store.listByCollection(nudgesCollection);
  final failures = await store.listByCollection(agentFailuresCollection);
  return countInboxAttention(
    pending: pending.where(keep),
    nudges: nudges.where(keep),
    failures: failures.where(keep),
  );
}
