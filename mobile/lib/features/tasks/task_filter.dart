import 'package:flutter/material.dart';

import '../../design/exo_choice_chips.dart';
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

/// Open / Done chips for the Tasks header.
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
    final selected =
        value == TaskListFilter.all ? TaskListFilter.open : value;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        ExoSpacing.lg,
        ExoSpacing.sm,
        ExoSpacing.lg,
        ExoSpacing.xs,
      ),
      child: ExoChoiceChips<TaskListFilter>(
        options: const [
          (TaskListFilter.open, SyncUserMessages.taskFilterOpen),
          (TaskListFilter.done, SyncUserMessages.taskFilterDone),
        ],
        selected: selected,
        onSelected: onChanged,
      ),
    );
  }
}
