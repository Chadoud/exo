import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../sync/user_messages.dart';

/// Task row — description, priority, due, and a tappable completed toggle.
class TaskListTile extends StatelessWidget {
  const TaskListTile({
    super.key,
    required this.payload,
    this.updatedAt,
    this.onTap,
    this.onToggleCompleted,
  });

  final Map<String, dynamic> payload;
  final String? updatedAt;
  final VoidCallback? onTap;

  /// Marks the task done / not done. Null renders a read-only indicator.
  final VoidCallback? onToggleCompleted;

  static String titleOf(Map<String, dynamic> payload) {
    final desc = payload['description']?.toString().trim();
    if (desc != null && desc.isNotEmpty) {
      return desc.length > 120 ? '${desc.substring(0, 120)}…' : desc;
    }
    return SyncUserMessages.taskFallbackTitle;
  }

  static bool isCompleted(Map<String, dynamic> payload) {
    final v = payload['completed'];
    if (v is bool) return v;
    if (v is num) return v != 0;
    return v?.toString() == 'true' || v?.toString() == '1';
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

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: ExoSpacing.lg,
            vertical: ExoSpacing.md,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CompletedToggle(
                done: done,
                title: title,
                onToggle: onToggleCompleted,
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

/// 48dp toggle target, separate from the row tap that opens the detail sheet.
class _CompletedToggle extends StatelessWidget {
  const _CompletedToggle({
    required this.done,
    required this.title,
    this.onToggle,
  });

  final bool done;
  final String title;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final icon = Icon(
      done ? Icons.check_circle : Icons.radio_button_unchecked,
      size: 22,
      color: done ? ExoColors.brandPrimary : ExoColors.textSecondary,
    );
    if (onToggle == null) {
      return Padding(padding: const EdgeInsets.all(ExoSpacing.xs), child: icon);
    }
    return Semantics(
      button: true,
      checked: done,
      label: done
          ? SyncUserMessages.taskMarkNotDone
          : SyncUserMessages.taskMarkDone,
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
