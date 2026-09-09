import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_choice_chips.dart';
import '../../design/exo_spacing.dart';
import '../../notifications/sync_debug_log.dart';
import '../../sync/inbox_edits.dart';
import '../../sync/inbox_payload.dart';
import '../../sync/local_store.dart';
import '../../sync/pending_action_payload.dart';
import '../../sync/sync_collection_scaffold.dart';
import '../../sync/sync_list_empty.dart';
import '../../sync/task_source_forget.dart';
import '../tasks/pending_actions_section.dart';
import 'inbox_advisory.dart';
import 'inbox_copy.dart';
import 'inbox_due.dart';
import 'inbox_sub_tab.dart';

/// Review lane — mail drafts, nudges, and agent failures.
class InboxScreen extends StatefulWidget {
  const InboxScreen({
    super.key,
    required this.config,
    this.onSignInAgain,
    this.onPairAgain,
    this.onReadyCount,
    this.focusRecordId,
  });

  final MobileSyncConfig config;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;
  final ValueChanged<int>? onReadyCount;
  final String? focusRecordId;

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  List<Map<String, dynamic>> _pending = [];
  List<Map<String, dynamic>> _nudges = [];
  List<Map<String, dynamic>> _failures = [];
  Map<String, int> _taskDueById = {};
  InboxSubTab _sub = InboxSubTab.toSend;
  bool _userPickedSub = false;
  int _seenEpoch = -1;
  int _loadToken = 0;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  @override
  void didUpdateWidget(covariant InboxScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusRecordId != widget.focusRecordId &&
        (widget.focusRecordId ?? '').isNotEmpty) {
      setState(() {
        _sub = InboxSubTab.toSend;
        _userPickedSub = true;
      });
    }
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    _loadToken++;
    super.dispose();
  }

  void _onConfig() {
    if (widget.config.dataEpoch != _seenEpoch) _reload();
  }

  List<Map<String, dynamic>> get _visibleNudges => visibleInboxNudges(_nudges);

  bool get _needsLookHasItems =>
      _visibleNudges.isNotEmpty || _failures.isNotEmpty;

  bool get _isEmpty => _pending.isEmpty && !_needsLookHasItems;

  bool get _laneEmpty {
    switch (_sub) {
      case InboxSubTab.toSend:
        return _pending.isEmpty;
      case InboxSubTab.needsLook:
        return !_needsLookHasItems;
    }
  }

  Future<void> _reload() async {
    final token = ++_loadToken;
    _seenEpoch = widget.config.dataEpoch;
    try {
      final pending = await _kept(pendingActionsCollection);
      final nudges = await _kept(nudgesCollection);
      final failures = await _kept(agentFailuresCollection);
      final tasks = await _kept(tasksCollection);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _pending = pending;
        _nudges = nudges;
        _failures = failures;
        _taskDueById = taskDueDaysByRecordId(tasks, now: DateTime.now());
        _landIfNeeded();
      });
      widget.onReadyCount?.call(
        countInboxAttention(pending: pending, nudges: nudges, failures: failures),
      );
    } catch (_) {
      if (!mounted || token != _loadToken) return;
      widget.onReadyCount?.call(0);
    }
  }

  void _landIfNeeded() {
    if (_userPickedSub) return;
    if ((widget.focusRecordId ?? '').isNotEmpty) {
      _sub = InboxSubTab.toSend;
      return;
    }
    if (_pending.isNotEmpty) {
      _sub = InboxSubTab.toSend;
      return;
    }
    if (_needsLookHasItems) {
      _sub = InboxSubTab.needsLook;
    }
  }

  Future<List<Map<String, dynamic>>> _kept(String collection) async {
    final rows = await widget.config.localStore.listByCollection(collection);
    return rows.where((row) => !LocalBrainStore.rowIsPendingDelete(row)).toList();
  }

  Future<void> _dismiss(String collection, String recordId) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final changed = await applyInboxDismiss(
      store: widget.config.localStore,
      collection: collection,
      recordId: recordId,
      now: now,
      deviceId: widget.config.deviceIdSync,
    );
    if (!changed) return;
    SyncDebugLog.note('inbox_dismiss:$collection:$recordId');
    unawaited(widget.config.engine.pushPendingEdits().catchError((_) {
      SyncDebugLog.note('inbox_dismiss_push_failed');
      return 0;
    }));
    if (!mounted) return;
    widget.config.markLocalDataChanged();
    _reload();
  }

  void _pickSub(InboxSubTab next) {
    if (next == _sub) return;
    setState(() {
      _sub = next;
      _userPickedSub = true;
    });
  }

  Widget _empty() {
    final copy = InboxCopy.of(context);
    final kind = classifySyncListEmpty(widget.config);
    final perLane = kind == SyncListEmptyKind.syncedEmpty && !_isEmpty;
    return ListenableBuilder(
      listenable: widget.config,
      builder: (context, _) {
        return SyncCollectionEmpty(
          kind: classifySyncListEmpty(widget.config),
          syncedEmptyTitle: perLane
              ? (_sub == InboxSubTab.toSend
                  ? copy.toSendEmptyTitle
                  : copy.needsLookEmptyTitle)
              : copy.emptyTitle,
          syncedEmptySubtitle: perLane
              ? (_sub == InboxSubTab.toSend
                  ? copy.toSendEmptySubtitle
                  : copy.needsLookEmptySubtitle)
              : copy.emptySubtitle,
          icon: Icons.inbox_outlined,
          syncInFlight: widget.config.syncInFlight,
          onPair: widget.onPairAgain,
        );
      },
    );
  }

  Widget _header() {
    final copy = InboxCopy.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        ExoSpacing.lg,
        ExoSpacing.sm,
        ExoSpacing.lg,
        ExoSpacing.xs,
      ),
      child: ExoChoiceChips<InboxSubTab>(
        options: [
          (InboxSubTab.toSend, copy.toSend),
          (InboxSubTab.needsLook, copy.needsLook),
        ],
        selected: _sub,
        onSelected: _pickSub,
      ),
    );
  }

  Widget _toSendBody() {
    return PendingActionsSection(
      config: widget.config,
      rows: _pending,
      onChanged: _reload,
      focusRecordId: widget.focusRecordId,
      taskDueById: _taskDueById,
    );
  }

  Widget _needsLookBody(InboxCopy copy) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InboxAdvisorySection(
          label: copy.nudgeSection,
          children: [
            for (final row in _visibleNudges)
              InboxNudgeCard(
                payload: inboxPayloadOf(row),
                onDismiss: () => _dismiss(
                  nudgesCollection,
                  row['record_id']?.toString() ?? '',
                ),
              ),
          ],
        ),
        InboxAdvisorySection(
          label: copy.failureSection,
          children: [
            for (final row in _failures)
              InboxFailureCard(
                payload: inboxPayloadOf(row),
                onDismiss: () => _dismiss(
                  agentFailuresCollection,
                  row['record_id']?.toString() ?? '',
                ),
              ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final copy = InboxCopy.of(context);
    return SyncCollectionScaffold(
      config: widget.config,
      onSignInAgain: widget.onSignInAgain,
      onPairAgain: widget.onPairAgain,
      header: _isEmpty ? null : _header(),
      listBody: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_sub == InboxSubTab.toSend) _toSendBody() else _needsLookBody(copy),
          if (_laneEmpty) ...[
            const SizedBox(height: ExoSpacing.xl),
            _empty(),
            const SizedBox(height: ExoSpacing.xl),
          ],
        ],
      ),
    );
  }
}
