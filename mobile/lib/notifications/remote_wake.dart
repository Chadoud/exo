import '../app/mobile_sync_config.dart';
import 'sync_debug_log.dart';

/// Opaque wake types from the relay — never carry mail/task plaintext.
const wakeTaskDue = 'task_due';
const wakeActionReady = 'action_ready';

class RemoteWakeResult {
  const RemoteWakeResult({required this.type, required this.openTasks});

  final String type;
  final bool openTasks;
}

Future<RemoteWakeResult?> handleRemoteWake({
  required MobileSyncConfig config,
  required String type,
}) async {
  if (type != wakeTaskDue && type != wakeActionReady) return null;
  SyncDebugLog.lastWakeType = type;
  SyncDebugLog.note('wake:$type');
  try {
    await config.syncNow();
  } catch (_) {
    SyncDebugLog.note('wake_sync_failed:$type');
  }
  return RemoteWakeResult(type: type, openTasks: true);
}
