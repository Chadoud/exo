import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../sync/source_stop.dart';
import '../../sync/source_stop_flow.dart';
import '../../sync/task_source_forget.dart';
import '../settings/source_stop_copy.dart';
import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';
import 'task_due_label.dart';
import 'task_list_tile.dart';

Future<void> showTaskDetailSheet({
  required BuildContext context,
  required MobileSyncConfig config,
  required Map<String, dynamic> payload,
  required bool canStop,
  required SourceStopPhase stopPhase,
  required VoidCallback onToggleCompleted,
}) {
  final source = payload['source']?.toString().trim() ?? '';
  final copy = SourceStopCopy.of(context);
  final offer = canStop && forgettableTaskSources.contains(source);
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => TaskDetailSheet(
      payload: payload,
      sourceChip: offer ? copy.fromChip(source) : null,
      sourceStopLabel:
          offer && stopPhase == SourceStopPhase.ready ? copy.stopFrom(source) : null,
      onStopSource: offer && stopPhase == SourceStopPhase.ready
          ? () {
              Navigator.pop(ctx);
              unawaited(confirmAndQueueSourceStop(
                context: context,
                config: config,
                source: source,
              ));
            }
          : null,
      onToggleCompleted: () {
        Navigator.pop(ctx);
        onToggleCompleted();
      },
    ),
  );
}

/// Read a synced task — tap target. Multi-select stays on long-press.
class TaskDetailSheet extends StatelessWidget {
  const TaskDetailSheet({
    super.key,
    required this.payload,
    this.now,
    this.onToggleCompleted,
    this.sourceChip,
    this.sourceStopLabel,
    this.onStopSource,
  });

  final Map<String, dynamic> payload;
  final DateTime? now;
  final VoidCallback? onToggleCompleted;
  final String? sourceChip;
  final String? sourceStopLabel;
  final VoidCallback? onStopSource;

  @override
  Widget build(BuildContext context) {
    final title = TaskListTile.titleOf(payload);
    final done = TaskListTile.isCompleted(payload);
    final clock = now ?? DateTime.now();
    final french = isFrenchLocale(Localizations.localeOf(context));
    final due = taskDueMeta(payload, now: clock, french: french);
    final overdue = taskDueIsOverdue(payload, now: clock);
    final priority = payload['priority']?.toString().trim() ?? '';
    final showPriority = priority.isNotEmpty && priority != 'normal';

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        ExoSpacing.lg,
        0,
        ExoSpacing.lg,
        ExoSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (due != null) ...[
            const SizedBox(height: ExoSpacing.sm),
            Text(
              due,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: overdue ? ExoColors.error : ExoColors.textSecondary,
                  ),
            ),
          ],
          if (showPriority) ...[
            const SizedBox(height: ExoSpacing.xs),
            Text(priority, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (sourceChip != null && sourceChip!.isNotEmpty) ...[
            const SizedBox(height: ExoSpacing.xs),
            Text(sourceChip!, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (done) ...[
            const SizedBox(height: ExoSpacing.sm),
            Text(
              SyncUserMessages.taskCompletedLabel,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: ExoSpacing.lg),
          ExoPrimaryButton(
            label: done
                ? SyncUserMessages.taskMarkNotDone
                : SyncUserMessages.taskMarkDone,
            onPressed: onToggleCompleted,
          ),
          if (onStopSource != null && sourceStopLabel != null) ...[
            const SizedBox(height: ExoSpacing.sm),
            TextButton(
              onPressed: onStopSource,
              child: Text(sourceStopLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
