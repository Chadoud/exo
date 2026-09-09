import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../notifications/due_reminder_scope.dart';
import '../../notifications/remote_wake.dart';
import '../../notifications/sync_debug_log.dart';

/// Staging/debug only — fingerprints and last events, never tokens or mail bodies.
class SyncDebugSection extends StatefulWidget {
  const SyncDebugSection({super.key, required this.config});

  final MobileSyncConfig config;

  static bool get visible => kDebugMode;

  @override
  State<SyncDebugSection> createState() => _SyncDebugSectionState();
}

class _SyncDebugSectionState extends State<SyncDebugSection> {
  @override
  Widget build(BuildContext context) {
    if (!SyncDebugSection.visible) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoSectionLabel('Debug sync'),
        const SizedBox(height: ExoSpacing.sm),
        ExoSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'last wake: ${SyncDebugLog.lastWakeType ?? '—'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Text(
                'last event: ${SyncDebugLog.lastEvent ?? '—'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Text(
                'due scheduled: ${SyncDebugLog.lastDueScheduled} · ready actions: ${SyncDebugLog.lastReadyActions}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Wrap(
                spacing: ExoSpacing.sm,
                children: [
                  TextButton(
                    onPressed: () => _wake(wakeTaskDue),
                    child: const Text('Simulate task wake'),
                  ),
                  TextButton(
                    onPressed: () => _wake(wakeActionReady),
                    child: const Text('Simulate action wake'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: ExoSpacing.xl),
      ],
    );
  }

  Future<void> _wake(String type) async {
    final controller = DueReminderScope.maybeOf(context);
    if (controller != null) {
      await controller.ingestWake(type);
    } else {
      await handleRemoteWake(config: widget.config, type: type);
    }
    if (!mounted) return;
    setState(() {});
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }
}
