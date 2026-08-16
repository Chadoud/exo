import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../sync/user_messages.dart';

/// Multi-select actions — done, not done, or remove from EXO.
class TaskSelectBar extends StatelessWidget {
  const TaskSelectBar({
    super.key,
    required this.selectedCount,
    required this.onMarkDone,
    required this.onMarkNotDone,
    required this.onRemove,
    required this.onSelectAll,
    required this.onCancel,
  });

  final int selectedCount;
  final VoidCallback onMarkDone;
  final VoidCallback onMarkNotDone;
  final VoidCallback onRemove;
  final VoidCallback onSelectAll;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        ExoSpacing.lg,
        ExoSpacing.xs,
        ExoSpacing.lg,
        ExoSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            SyncUserMessages.tasksSelected(selectedCount),
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: ExoSpacing.xs),
          Wrap(
            spacing: ExoSpacing.sm,
            runSpacing: ExoSpacing.xs,
            children: [
              TextButton(
                onPressed: onMarkDone,
                child: const Text(SyncUserMessages.taskMarkDone),
              ),
              TextButton(
                onPressed: onMarkNotDone,
                child: const Text(SyncUserMessages.taskMarkNotDone),
              ),
              TextButton(
                onPressed: onRemove,
                style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                child: const Text(SyncUserMessages.taskRemove),
              ),
              TextButton(
                onPressed: onSelectAll,
                child: const Text(SyncUserMessages.taskSelectAll),
              ),
              TextButton(
                onPressed: onCancel,
                child: const Text(SyncUserMessages.cancel),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
