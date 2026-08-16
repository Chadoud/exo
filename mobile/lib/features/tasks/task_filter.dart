import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../sync/user_messages.dart';

enum TaskListFilter { open, done, all }

String taskFilterLabel(TaskListFilter filter) {
  switch (filter) {
    case TaskListFilter.open:
      return SyncUserMessages.taskFilterOpen;
    case TaskListFilter.done:
      return SyncUserMessages.taskFilterDone;
    case TaskListFilter.all:
      return SyncUserMessages.taskFilterAll;
  }
}

/// Open / Done / All chips for the Tasks header.
class TaskFilterChips extends StatelessWidget {
  const TaskFilterChips({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final TaskListFilter value;
  final ValueChanged<TaskListFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        ExoSpacing.lg,
        ExoSpacing.sm,
        ExoSpacing.lg,
        ExoSpacing.xs,
      ),
      child: Wrap(
        spacing: ExoSpacing.sm,
        children: [
          for (final filter in TaskListFilter.values)
            ChoiceChip(
              label: Text(taskFilterLabel(filter)),
              selected: value == filter,
              onSelected: (_) => onChanged(filter),
            ),
        ],
      ),
    );
  }
}
