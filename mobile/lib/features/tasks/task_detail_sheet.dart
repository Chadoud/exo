import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_palette.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/local_store.dart';
import '../../sync/pending_action_payload.dart';
import '../../sync/source_stop.dart';
import '../../sync/source_stop_flow.dart';
import '../../sync/task_source_forget.dart';
import '../../sync/user_messages.dart';
import '../settings/source_stop_copy.dart';
import 'pending_actions_section.dart';
import 'task_due_label.dart';
import 'task_list_tile.dart';

Future<void> showTaskDetailSheet({
  required BuildContext context,
  required MobileSyncConfig config,
  required Map<String, dynamic> payload,
  required String taskRecordId,
  required bool canStop,
  required SourceStopPhase stopPhase,
  required VoidCallback onToggleCompleted,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) {
      final maxH = MediaQuery.sizeOf(ctx).height * 0.92;
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxH),
          child: _LiveTaskDetailSheet(
            config: config,
            payload: payload,
            taskRecordId: taskRecordId,
            canStop: canStop,
            stopPhase: stopPhase,
            onToggleCompleted: () {
              Navigator.pop(ctx);
              onToggleCompleted();
            },
          ),
        ),
      );
    },
  );
}

class _LiveTaskDetailSheet extends StatefulWidget {
  const _LiveTaskDetailSheet({
    required this.config,
    required this.payload,
    required this.taskRecordId,
    required this.canStop,
    required this.stopPhase,
    required this.onToggleCompleted,
  });

  final MobileSyncConfig config;
  final Map<String, dynamic> payload;
  final String taskRecordId;
  final bool canStop;
  final SourceStopPhase stopPhase;
  final VoidCallback onToggleCompleted;

  @override
  State<_LiveTaskDetailSheet> createState() => _LiveTaskDetailSheetState();
}

class _LiveTaskDetailSheetState extends State<_LiveTaskDetailSheet> {
  List<Map<String, dynamic>> _pending = [];
  int _loadToken = 0;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _reloadPending();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    _loadToken++;
    super.dispose();
  }

  void _onConfig() => _reloadPending();

  Future<void> _reloadPending() async {
    if (!widget.config.isPaired) {
      if (mounted) setState(() => _pending = []);
      return;
    }
    final token = ++_loadToken;
    final pending = List<Map<String, dynamic>>.from(
      await widget.config.localStore.listByCollection(pendingActionsCollection),
    ).where((row) => !LocalBrainStore.rowIsPendingDelete(row)).toList();
    if (!mounted || token != _loadToken) return;
    final row = pendingRowForTask(pending, widget.taskRecordId);
    setState(() => _pending = row == null ? [] : [row]);
  }

  @override
  Widget build(BuildContext context) {
    final source = widget.payload['source']?.toString().trim() ?? '';
    final copy = SourceStopCopy.of(context);
    final offer = widget.canStop && forgettableTaskSources.contains(source);
    return TaskDetailSheet(
      payload: widget.payload,
      sourceChip: offer ? copy.fromChip(source) : null,
      sourceStopLabel:
          offer && widget.stopPhase == SourceStopPhase.ready
              ? copy.stopFrom(source)
              : null,
      onStopSource: offer && widget.stopPhase == SourceStopPhase.ready
          ? () {
              Navigator.pop(context);
              unawaited(confirmAndQueueSourceStop(
                context: context,
                config: widget.config,
                source: source,
              ));
            }
          : null,
      onToggleCompleted: widget.onToggleCompleted,
      action: _pending.isEmpty
          ? null
          : PendingActionsSection(
              config: widget.config,
              rows: _pending,
              padded: false,
              startExpanded: true,
              onChanged: _reloadPending,
            ),
    );
  }
}

/// Read a synced task — row tap. Checkbox / long-press stay on multi-select.
class TaskDetailSheet extends StatelessWidget {
  const TaskDetailSheet({
    super.key,
    required this.payload,
    this.now,
    this.onToggleCompleted,
    this.sourceChip,
    this.sourceStopLabel,
    this.onStopSource,
    this.action,
  });

  final Map<String, dynamic> payload;
  final DateTime? now;
  final VoidCallback? onToggleCompleted;
  final String? sourceChip;
  final String? sourceStopLabel;
  final VoidCallback? onStopSource;
  final Widget? action;

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

    return SingleChildScrollView(
      child: Padding(
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
                      color: overdue
                          ? Theme.of(context).colorScheme.error
                          : ExoPalette.of(context).textSecondary,
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
            if (action != null) ...[
              const SizedBox(height: ExoSpacing.lg),
              action!,
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
      ),
    );
  }
}
