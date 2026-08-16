import 'dart:convert';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../sync/local_store.dart';
import '../../sync/sync_collection_scaffold.dart';
import '../../sync/sync_list_empty.dart';
import '../../sync/task_payload.dart';
import '../../sync/user_messages.dart';
import 'task_list_tile.dart';

/// Tasks tab — synced desktop tasks (sync UI via [SyncCollectionScaffold]).
class TasksScreen extends StatefulWidget {
  const TasksScreen({
    super.key,
    required this.config,
    this.onSignInAgain,
    this.onPairAgain,
  });

  final MobileSyncConfig config;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  List<Map<String, dynamic>> _items = [];
  int _seenEpoch = -1;
  int _loadToken = 0;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _reload();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    _loadToken++;
    super.dispose();
  }

  void _onConfig() {
    if (widget.config.dataEpoch != _seenEpoch) {
      _reload();
    }
  }

  Future<void> _reload() async {
    final token = ++_loadToken;
    final epoch = widget.config.dataEpoch;
    _seenEpoch = epoch;
    final rows = List<Map<String, dynamic>>.from(
      await widget.config.localStore.listByCollection('tasks'),
    ).where((row) => !LocalBrainStore.rowIsPendingDelete(row)).toList();
    if (!mounted || token != _loadToken) return;
    rows.sort(_compareTaskRows);
    setState(() => _items = rows);
  }

  /// Incomplete first, then due date, then newest updated.
  static int _compareTaskRows(Map<String, dynamic> a, Map<String, dynamic> b) {
    final pa = _payloadOf(a);
    final pb = _payloadOf(b);
    final ca = taskPayloadIsCompleted(pa);
    final cb = taskPayloadIsCompleted(pb);
    if (ca != cb) return ca ? 1 : -1;
    final da = DateTime.tryParse(pa['due_at']?.toString() ?? '');
    final db = DateTime.tryParse(pb['due_at']?.toString() ?? '');
    if (da != null && db != null) {
      final c = da.compareTo(db);
      if (c != 0) return c;
    } else if (da != null) {
      return -1;
    } else if (db != null) {
      return 1;
    }
    final ua = a['updated_at']?.toString() ?? '';
    final ub = b['updated_at']?.toString() ?? '';
    return ub.compareTo(ua);
  }

  static Map<String, dynamic> _payloadOf(Map<String, dynamic> row) {
    try {
      return jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }

  Future<void> _toggleCompleted(Map<String, dynamic> row) async {
    final recordId = row['record_id']?.toString();
    if (recordId == null || recordId.isEmpty) return;
    final completed = TaskListTile.isCompleted(_payloadOf(row));
    await widget.config.setTaskCompleted(
      recordId: recordId,
      completed: !completed,
    );
  }

  void _openDetail(Map<String, dynamic> row) {
    final payload = _payloadOf(row);
    final title = TaskListTile.titleOf(payload);
    final meta = TaskListTile.metaLine(payload);
    final done = TaskListTile.isCompleted(payload);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: ExoColors.bgElevated,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              ExoSpacing.lg,
              ExoSpacing.sm,
              ExoSpacing.lg,
              ExoSpacing.xl,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(ctx).textTheme.titleLarge),
                if (meta != null) ...[
                  const SizedBox(height: ExoSpacing.sm),
                  Text(meta, style: Theme.of(ctx).textTheme.bodySmall),
                ],
                const SizedBox(height: ExoSpacing.lg),
                Text(
                  SyncUserMessages.taskDetailReviewHint,
                  style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                        color: ExoColors.textSecondary,
                      ),
                ),
                const SizedBox(height: ExoSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    icon: Icon(
                      done ? Icons.radio_button_unchecked : Icons.check_circle,
                    ),
                    label: Text(
                      done
                          ? SyncUserMessages.taskMarkNotDone
                          : SyncUserMessages.taskMarkDone,
                    ),
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      _toggleCompleted(row);
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _listBody() {
    if (_items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: ExoSpacing.xl),
          ListenableBuilder(
            listenable: widget.config,
            builder: (context, _) {
              return SyncCollectionEmpty(
                kind: classifySyncListEmpty(widget.config),
                syncedEmptyTitle: SyncUserMessages.tasksEmptyTitle,
                syncedEmptySubtitle: SyncUserMessages.tasksEmptySubtitle,
                icon: Icons.task_alt_outlined,
                syncInFlight: widget.config.syncInFlight,
                onPair: widget.onPairAgain,
              );
            },
          ),
          const SizedBox(height: ExoSpacing.xl),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: _items.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final row = _items[index];
        final payload = _payloadOf(row);
        return TaskListTile(
          payload: payload,
          updatedAt: row['updated_at']?.toString(),
          onTap: () => _openDetail(row),
          onToggleCompleted: () => _toggleCompleted(row),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return SyncCollectionScaffold(
      config: widget.config,
      onSignInAgain: widget.onSignInAgain,
      onPairAgain: widget.onPairAgain,
      listBody: _listBody(),
    );
  }
}
