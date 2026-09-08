import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/sync_collection_scaffold.dart';
import '../../sync/sync_list_empty.dart';
import '../../sync/local_store.dart';
import '../../sync/pending_action_payload.dart';
import '../../sync/task_payload.dart';
import '../../sync/task_source_forget.dart';
import '../../sync/source_stop.dart';
import '../../notifications/due_reminder_copy.dart';
import '../../sync/user_messages.dart';
import 'task_detail_sheet.dart';
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
    this.focusRecordId,
    this.onOpenInbox,
  });

  final MobileSyncConfig config;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;
  final String? focusRecordId;
  final ValueChanged<String>? onOpenInbox;

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _pendingRows = [];
  TaskListFilter _filter = TaskListFilter.open;
  final Set<String> _selectedIds = {};
  bool _selecting = false;
  int _seenEpoch = -1;
  int _loadToken = 0;
  final _scroll = ScrollController();
  String? _missingFocus;
  String? _openedSheetFor;
  String? _redirectedFocus;
  bool _hasForgetCapability = false;
  final Map<String, SourceStopPhase> _stopPhases = {};

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _reload();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    _scroll.dispose();
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
    final all = List<Map<String, dynamic>>.from(
      await widget.config.localStore.listByCollection('tasks'),
    );
    if (!mounted || token != _loadToken) return;
    var capable = false;
    final phases = <String, SourceStopPhase>{};
    final rows = <Map<String, dynamic>>[];
    for (final row in all) {
      final id = taskRecordIdOf(row);
      if (id == sourceForgetCapabilityId &&
          !LocalBrainStore.rowIsPendingDelete(row)) {
        capable = true;
      }
      if (id != null &&
          id.startsWith(sourceForgetPrefix) &&
          forgettableTaskSources.contains(id.substring(sourceForgetPrefix.length))) {
        phases[id.substring(sourceForgetPrefix.length)] =
            sourceStopPhaseFromRow(row);
      }
      if (id == null || isSyncControlTaskRecord(id)) continue;
      if (LocalBrainStore.rowIsPendingDelete(row)) continue;
      rows.add(row);
    }
    rows.sort(compareTaskRows);
    var pending = <Map<String, dynamic>>[];
    if (widget.config.isPaired) {
      pending = List<Map<String, dynamic>>.from(
        await widget.config.localStore.listByCollection(pendingActionsCollection),
      ).where((row) => !LocalBrainStore.rowIsPendingDelete(row)).toList();
      if (!mounted || token != _loadToken) return;
    }
    final focus = widget.focusRecordId;
    if (focus != null &&
        focus.isNotEmpty &&
        focus != _redirectedFocus) {
      final join = pendingRecordIdForTask(pending, focus);
      if (join != null) {
        _redirectedFocus = focus;
        setState(() {
          _items = rows;
          _pendingRows = pending;
          _missingFocus = null;
          _hasForgetCapability = capable;
          _stopPhases
            ..clear()
            ..addAll(phases);
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          widget.onOpenInbox?.call(join);
        });
        return;
      }
    }
    var missing = _missingFocus;
    if (focus != null &&
        focus.isNotEmpty &&
        !rows.any((row) => taskRecordIdOf(row) == focus)) {
      missing = focus;
    } else if (focus != null) {
      missing = null;
      _revealFocus(rows, focus);
    }
    setState(() {
      _items = rows;
      _pendingRows = pending;
      _missingFocus = missing;
      _hasForgetCapability = capable;
      _stopPhases
        ..clear()
        ..addAll(phases);
    });
    _maybeOpenFocusSheet();
    if (focus != null && missing == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToFocus(focus));
    }
  }

  @override
  void didUpdateWidget(covariant TasksScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusRecordId != widget.focusRecordId) {
      _reload();
    }
  }

  void _revealFocus(List<Map<String, dynamic>> rows, String focus) {
    final match = rows.where((row) => taskRecordIdOf(row) == focus);
    if (match.isEmpty) return;
    final done = taskPayloadIsCompleted(taskPayloadOf(match.first));
    _filter = done ? TaskListFilter.done : TaskListFilter.open;
  }

  void _scrollToFocus(String focus) {
    if (!_scroll.hasClients) return;
    final index = _visible.indexWhere((row) => taskRecordIdOf(row) == focus);
    if (index < 0) return;
    _scroll.animateTo(
      index * 88.0,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOut,
    );
  }

  List<Map<String, dynamic>> get _visible {
    switch (_filter) {
      case TaskListFilter.open:
        return _items
            .where((row) => !taskPayloadIsCompleted(taskPayloadOf(row)))
            .toList();
      case TaskListFilter.done:
        return _items
            .where((row) => taskPayloadIsCompleted(taskPayloadOf(row)))
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
          _visible.map(taskRecordIdOf).whereType<String>(),
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
    final recordId = taskRecordIdOf(row);
    if (recordId == null) return;
    final done = taskPayloadIsCompleted(taskPayloadOf(row));
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
    final recordId = taskRecordIdOf(row);
    if (recordId == null) return;
    if (_selecting) {
      _toggleSelect(recordId);
      return;
    }
    final join = pendingRecordIdForTask(_pendingRows, recordId);
    if (join != null) {
      widget.onOpenInbox?.call(join);
      return;
    }
    _showDetail(row);
  }

  void _maybeOpenFocusSheet() {
    final focus = widget.focusRecordId;
    if (focus == null || focus.isEmpty) return;
    if (focus == _openedSheetFor || _missingFocus != null) return;
    Map<String, dynamic>? match;
    for (final row in _items) {
      if (taskRecordIdOf(row) == focus) {
        match = row;
        break;
      }
    }
    if (match == null) return;
    _openedSheetFor = focus;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _showDetail(match!);
    });
  }

  Future<void> _showDetail(Map<String, dynamic> row) async {
    if (!mounted) return;
    final payload = taskPayloadOf(row);
    final source = payload['source']?.toString().trim() ?? '';
    await showTaskDetailSheet(
      context: context,
      config: widget.config,
      payload: payload,
      canStop: widget.config.isPaired && _hasForgetCapability,
      stopPhase: _stopPhases[source] ?? SourceStopPhase.ready,
      onToggleCompleted: () => unawaited(_toggleCompleted(row)),
    );
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

  Widget _inbox() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_missingFocus != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              ExoSpacing.lg,
              ExoSpacing.sm,
              ExoSpacing.lg,
              0,
            ),
            child: ExoSyncStatusBanner(
              message: DueReminderCopy.of(context).taskGone,
            ),
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
          _inbox(),
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
          _inbox(),
          const SizedBox(height: ExoSpacing.xl),
          _filterEmpty(),
        ],
      );
    }

    return ListView.separated(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: visible.length + 1,
      separatorBuilder: (context, index) {
        if (index == 0) return const SizedBox.shrink();
        return const Divider(height: 1);
      },
      itemBuilder: (context, index) {
        if (index == 0) return _inbox();
        final row = visible[index - 1];
        final recordId = taskRecordIdOf(row) ?? '';
        return TaskListTile(
          payload: taskPayloadOf(row),
          updatedAt: row['updated_at']?.toString(),
          selecting: _selecting,
          selected: _selectedIds.contains(recordId),
          highlighted: recordId.isNotEmpty && recordId == widget.focusRecordId,
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
