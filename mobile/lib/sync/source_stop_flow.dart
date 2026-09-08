import 'package:flutter/material.dart';

import '../app/mobile_sync_config.dart';
import '../features/settings/source_stop_copy.dart';
import 'source_stop.dart';
import 'user_messages.dart';

Future<bool> confirmAndQueueSourceStop({
  required BuildContext context,
  required MobileSyncConfig config,
  required String source,
}) async {
  final copy = SourceStopCopy.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(copy.confirmTitle(source)),
      content: Text(copy.confirmBody(source)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text(SyncUserMessages.cancel),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(copy.stop),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;
  final pushed = await queueSourceStop(
    store: config.localStore,
    engine: config.engine,
    source: source,
    deviceId: config.deviceIdSync,
  );
  if (!context.mounted) return false;
  if (!pushed) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(copy.failed)),
    );
    return false;
  }
  config.noteLocalDataChanged();
  return true;
}
