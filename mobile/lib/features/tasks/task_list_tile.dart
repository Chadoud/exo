import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../sync/task_payload.dart';
import '../../sync/user_messages.dart';

/// Task row — description, priority, due, and a tappable completed toggle.
class TaskListTile extends StatelessWidget {
  const TaskListTile({
    super.key,
    required this.payload,
    this.updatedAt,
    this.onTap,
    this.onLongPress,
    this.onToggleCompleted,
    this.selecting = false,
    this.selected = false,
  });

  final Map<String, dynamic> payload;
  final String? updatedAt;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onToggleCompleted;
  final bool selecting;
  final bool selected;

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

  static String? metaLine(Map<String, dynamic> payload) {
    final parts = <String>[];
    if (isCompleted(payload)) {
      parts.add(SyncUserMessages.taskCompletedLabel);
    } else {
      final priority = payload['priority']?.toString().trim();
      if (priority != null && priority.isNotEmpty && priority != 'normal') {
        parts.add(priority);
      }
      final due = payload['due_at']?.toString().trim();
      if (due != null && due.isNotEmpty) {
        final dt = DateTime.tryParse(due);
        if (dt != null) {
          parts.add(
            'Due ${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}',
          );
        }
      }
    }
    if (parts.isEmpty) return null;
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final title = titleOf(payload);
    final done = isCompleted(payload);
    final meta = metaLine(payload);
    final leadingAction = selecting ? onTap : onToggleCompleted;

    return Material(
      color: selected ? ExoColors.accentLight : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: ExoSpacing.lg,
            vertical: ExoSpacing.md,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LeadingControl(
                done: done,
                title: title,
                selecting: selecting,
                selected: selected,
                onToggle: leadingAction,
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
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: ExoColors.textPrimary,
                            decoration: done ? TextDecoration.lineThrough : null,
                          ),
                    ),
                    if (meta != null) ...[
                      const SizedBox(height: ExoSpacing.xs),
                      Text(meta, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 44dp target — completion when browsing, selection when multi-selecting.
class _LeadingControl extends StatelessWidget {
  const _LeadingControl({
    required this.done,
    required this.title,
    required this.selecting,
    required this.selected,
    this.onToggle,
  });

  final bool done;
  final String title;
  final bool selecting;
  final bool selected;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final IconData iconData;
    final Color color;
    if (selecting) {
      iconData = selected ? Icons.check_box : Icons.check_box_outline_blank;
      color = selected ? ExoColors.brandPrimary : ExoColors.textSecondary;
    } else {
      iconData = done ? Icons.check_circle : Icons.radio_button_unchecked;
      color = done ? ExoColors.brandPrimary : ExoColors.textSecondary;
    }
    final icon = Icon(iconData, size: 22, color: color);
    if (onToggle == null) {
      return Padding(padding: const EdgeInsets.all(ExoSpacing.xs), child: icon);
    }
    return Semantics(
      button: true,
      checked: selecting ? selected : done,
      selected: selecting ? selected : null,
      label: selecting
          ? title
          : (done
              ? SyncUserMessages.taskMarkNotDone
              : SyncUserMessages.taskMarkDone),
      child: InkWell(
        onTap: onToggle,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(child: icon),
        ),
      ),
    );
  }
}
