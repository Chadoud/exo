import 'dart:convert';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../sync/sync_collection_scaffold.dart';
import '../../sync/sync_list_empty.dart';
import '../../sync/local_store.dart';
import '../../sync/task_payload.dart';
import '../../sync/user_messages.dart';
import 'task_filter.dart';
import 'task_list_tile.dart';
import 'task_select_bar.dart';

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
  TaskListFilter _filter = TaskListFilter.open;
  final Set<String> _selectedIds = {};
  bool _selecting = false;
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

  static String? _recordIdOf(Map<String, dynamic> row) {
    final id = row['record_id']?.toString();
    if (id == null || id.isEmpty) return null;
    return id;
  }

  List<Map<String, dynamic>> get _visible {
    switch (_filter) {
      case TaskListFilter.open:
        return _items
            .where((row) => !taskPayloadIsCompleted(_payloadOf(row)))
            .toList();
      case TaskListFilter.done:
        return _items
            .where((row) => taskPayloadIsCompleted(_payloadOf(row)))
            .toList();
      case TaskListFilter.all:
        return _items;
    }
  }

  void _clearSelection() {
    if (!_selecting && _selectedIds.isEmpty) return;
    setState(() {
      _selecting = false;
      _selectedIds.clear();
    });
  }

  void _setFilter(TaskListFilter next) {
    if (next == _filter) return;
    setState(() {
      _filter = next;
      _selecting = false;
      _selectedIds.clear();
    });
  }

  void _enterSelect(String recordId) {
    setState(() {
      _selecting = true;
      _selectedIds
        ..clear()
        ..add(recordId);
    });
  }

  void _toggleSelect(String recordId) {
    setState(() {
      if (_selectedIds.contains(recordId)) {
        _selectedIds.remove(recordId);
      } else {
        _selectedIds.add(recordId);
      }
      if (_selectedIds.isEmpty) _selecting = false;
    });
  }

  void _selectAllVisible() {
    setState(() {
      _selecting = true;
      _selectedIds
        ..clear()
        ..addAll(
          _visible.map(_recordIdOf).whereType<String>(),
        );
    });
  }

  void _showMarkedSnack(int count, {required bool completed}) {
    if (count <= 0 || !mounted) return;
    final text = completed
        ? SyncUserMessages.tasksMarkedDone(count)
        : SyncUserMessages.tasksMarkedNotDone(count);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _toggleCompleted(Map<String, dynamic> row) async {
    final recordId = _recordIdOf(row);
    if (recordId == null) return;
    final done = taskPayloadIsCompleted(_payloadOf(row));
    final changed = await widget.config.setTasksCompleted(
      recordIds: [recordId],
      completed: !done,
    );
    _showMarkedSnack(changed, completed: !done);
  }

  Future<void> _applySelection({required bool completed}) async {
    final ids = _selectedIds.toList();
    _clearSelection();
    final changed = await widget.config.setTasksCompleted(
      recordIds: ids,
      completed: completed,
    );
    _showMarkedSnack(changed, completed: completed);
  }

  Future<void> _confirmRemove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(SyncUserMessages.taskRemoveConfirmTitle),
        content: const Text(SyncUserMessages.taskRemoveConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text(SyncUserMessages.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(SyncUserMessages.taskRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final ids = _selectedIds.toList();
    _clearSelection();
    final changed = await widget.config.deleteTasks(recordIds: ids);
    if (changed <= 0 || !mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(SyncUserMessages.tasksRemoved(changed))));
  }

  void _onRowTap(Map<String, dynamic> row) {
    final recordId = _recordIdOf(row);
    if (recordId == null) return;
    if (_selecting) {
      _toggleSelect(recordId);
      return;
    }
    _enterSelect(recordId);
  }

  Widget _header() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TaskFilterChips(value: _filter, onChanged: _setFilter),
        if (_selecting)
          TaskSelectBar(
            selectedCount: _selectedIds.length,
            onMarkDone: () => _applySelection(completed: true),
            onMarkNotDone: () => _applySelection(completed: false),
            onRemove: () => _confirmRemove(),
            onSelectAll: _selectAllVisible,
            onCancel: _clearSelection,
          ),
      ],
    );
  }

  Widget _syncedEmpty() {
    return ListenableBuilder(
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
    );
  }

  Widget _filterEmpty() {
    final title = _filter == TaskListFilter.done
        ? SyncUserMessages.tasksDoneEmptyTitle
        : SyncUserMessages.tasksOpenEmptyTitle;
    return Padding(
      padding: const EdgeInsets.all(ExoSpacing.xl),
      child: Column(
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: ExoSpacing.sm),
          Text(
            SyncUserMessages.tasksFilterEmptySubtitle,
            style: Theme.of(context).textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _listBody() {
    if (_items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: ExoSpacing.xl),
          _syncedEmpty(),
          const SizedBox(height: ExoSpacing.xl),
        ],
      );
    }

    final visible = _visible;
    if (visible.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: ExoSpacing.xl),
          _filterEmpty(),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: visible.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final row = visible[index];
        final recordId = _recordIdOf(row) ?? '';
        return TaskListTile(
          payload: _payloadOf(row),
          updatedAt: row['updated_at']?.toString(),
          selecting: _selecting,
          selected: _selectedIds.contains(recordId),
          onTap: () => _onRowTap(row),
          onLongPress: recordId.isEmpty ? null : () => _enterSelect(recordId),
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
      onRefresh: _clearSelection,
      header: _header(),
      listBody: _listBody(),
    );
  }
}
