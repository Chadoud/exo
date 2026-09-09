import 'package:flutter/material.dart';

import '../../design/due_day_badge.dart';
import '../../design/exo_palette.dart';
import '../../design/exo_spacing.dart';
import '../../sync/task_payload.dart';
import '../../sync/user_messages.dart';
import 'task_due_label.dart';

/// Task row — description, due, and a checkbox that starts multi-select.
class TaskListTile extends StatelessWidget {
  const TaskListTile({
    super.key,
    required this.payload,
    this.updatedAt,
    this.onTap,
    this.onLongPress,
    this.onSelect,
    this.selecting = false,
    this.selected = false,
    this.highlighted = false,
  });

  final Map<String, dynamic> payload;
  final String? updatedAt;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onSelect;
  final bool selecting;
  final bool selected;
  final bool highlighted;

  static String titleOf(Map<String, dynamic> payload) {
    final desc = payload['description']?.toString().trim();
    if (desc != null && desc.isNotEmpty) {
      return desc.length > 120 ? '${desc.substring(0, 120)}…' : desc;
    }
    return SyncUserMessages.taskFallbackTitle;
  }

  static bool isCompleted(Map<String, dynamic> payload) {
    return taskPayloadIsCompleted(payload);
  }

  static String? metaLine(
    Map<String, dynamic> payload, {
    DateTime? now,
    Locale? locale,
  }) {
    final parts = <String>[];
    if (isCompleted(payload)) {
      parts.add(SyncUserMessages.taskCompletedLabel);
    } else {
      final priority = payload['priority']?.toString().trim();
      if (priority != null && priority.isNotEmpty && priority != 'normal') {
        parts.add(priority);
      }
      final due = taskDueMeta(
        payload,
        now: now ?? DateTime.now(),
        french: isFrenchLocale(locale),
      );
      if (due != null) parts.add(due);
    }
    if (parts.isEmpty) return null;
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final title = titleOf(payload);
    final done = isCompleted(payload);
    final clock = DateTime.now();
    final locale = Localizations.localeOf(context);
    final meta = metaLine(payload, now: clock, locale: locale);
    final overdue = taskDueIsOverdue(payload, now: clock);
    final dueDays = taskDueDayDelta(payload, now: clock);
    final theme = Theme.of(context);
    final palette = ExoPalette.of(context);

    return Material(
      color: (selected || highlighted) ? palette.accentLight : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: ExoSpacing.lg,
            vertical: ExoSpacing.md,
          ),
          child: DueDayCardStack(
            days: dueDays,
            french: isFrenchLocale(locale),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _LeadingControl(
                  title: title,
                  selected: selected,
                  onSelect: onSelect,
                ),
                const SizedBox(width: ExoSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                              color: theme.colorScheme.onSurface,
                              decoration: done ? TextDecoration.lineThrough : null,
                            ),
                      ),
                      if (meta != null) ...[
                        const SizedBox(height: ExoSpacing.xs),
                        Text(
                          meta,
                          style: theme.textTheme.bodySmall?.copyWith(
                                color: overdue ? theme.colorScheme.error : null,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Always a checkbox — tap enters or toggles multi-select, never completes.
class _LeadingControl extends StatelessWidget {
  const _LeadingControl({
    required this.title,
    required this.selected,
    this.onSelect,
  });

  final String title;
  final bool selected;
  final VoidCallback? onSelect;

  @override
  Widget build(BuildContext context) {
    final palette = ExoPalette.of(context);
    final icon = Icon(
      selected ? Icons.check_box : Icons.check_box_outline_blank,
      size: 22,
      color: selected ? palette.selectedInk : palette.textSecondary,
    );
    if (onSelect == null) {
      return Padding(padding: const EdgeInsets.all(ExoSpacing.xs), child: icon);
    }
    return Semantics(
      button: true,
      checked: selected,
      label: '$title · ${SyncUserMessages.taskSelect}',
      child: InkWell(
        onTap: onSelect,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 48,
          height: 48,
          child: Center(child: icon),
        ),
      ),
    );
  }
}
