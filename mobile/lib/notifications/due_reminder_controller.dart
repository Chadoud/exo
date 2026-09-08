import 'dart:async';

import 'package:flutter/widgets.dart';

import '../app/mobile_sync_config.dart';
import '../sync/local_store.dart';
import '../sync/task_source_forget.dart';
import '../sync/pending_action_payload.dart';
import 'due_reminder_copy.dart';
import 'due_reminder_host.dart';
import 'due_reminder_plan.dart';
import 'due_reminder_prefs.dart';
import 'remote_wake.dart';
import 'sync_debug_log.dart';

/// Rebuilds local due notifications after sync / edits / sign-out.
class DueReminderController extends ChangeNotifier {
  DueReminderController({
    required MobileSyncConfig config,
    required DueReminderHost host,
    DueReminderPrefs? prefs,
    DateTime Function()? now,
  })  : _config = config,
        _host = host,
        _prefs = prefs ?? DueReminderPrefs(config.storage),
        _now = now ?? DateTime.now {
    _config.addListener(_onConfig);
    _tapSub = _host.taskTaps.listen(_onTap);
  }

  final MobileSyncConfig _config;
  final DueReminderHost _host;
  final DueReminderPrefs _prefs;
  final DateTime Function() _now;
  StreamSubscription<String>? _tapSub;

  bool _needsPrompt = false;
  String? _openedTaskId;
  bool _openTasks = false;
  final Set<String> _notifiedReadyIds = {};
  int _seenEpoch = -1;
  bool _reconcileAgain = false;
  bool _alive = true;
  Future<void>? _reconcileFuture;
  DueReminderCopy _copy = DueReminderCopy(const Locale('en'));

  DueReminderPrefs get prefs => _prefs;
  DueReminderHost get host => _host;
  bool get needsPrompt => _needsPrompt;
  String? consumeOpenedTaskId() {
    final id = _openedTaskId;
    _openedTaskId = null;
    return id;
  }

  bool consumeOpenTasks() {
    final open = _openTasks;
    _openTasks = false;
    return open;
  }

  void _emit() {
    if (_alive) notifyListeners();
  }

  /// Debug / future FCM: `{type}` only. Syncs then asks the shell for Tasks.
  Future<RemoteWakeResult?> ingestWake(String type) async {
    final result = await handleRemoteWake(config: _config, type: type);
    if (result?.openTasks == true) {
      _openTasks = true;
      notifyListeners();
    }
    return result;
  }

  void _onTap(String recordId) {
    if (recordId.isEmpty) return;
    _openedTaskId = recordId;
    notifyListeners();
  }

  void _onConfig() {
    if (_config.dataEpoch == _seenEpoch && _config.isSignedIn && _config.isPaired) {
      return;
    }
    unawaited(reconcile());
  }

  Future<void> reconcile({DueReminderCopy? copy}) async {
    if (copy != null) _copy = copy;
    _reconcileAgain = true;
    final inFlight = _reconcileFuture;
    if (inFlight != null) {
      await inFlight;
      if (_reconcileAgain && _reconcileFuture == null) {
        await reconcile();
      }
      return;
    }
    final run = _drainReconcile();
    _reconcileFuture = run;
    try {
      await run;
    } finally {
      if (identical(_reconcileFuture, run)) {
        _reconcileFuture = null;
      }
    }
  }

  Future<void> _drainReconcile() async {
    while (_alive && _reconcileAgain) {
      _reconcileAgain = false;
      await _reconcileBody(_copy);
    }
  }

  Future<void> _reconcileBody(DueReminderCopy copy) async {
    if (!_alive) return;
    _seenEpoch = _config.dataEpoch;
    if (!_config.isSignedIn || !_config.isPaired) {
      _needsPrompt = false;
      _notifiedReadyIds.clear();
      await _prefs.reset();
      await _host.cancelAll();
      _emit();
      return;
    }
    final rows = await _dueCandidateRows();
    final preview = planDueReminders(
      rows: rows,
      now: _now(),
      showLockScreenDetail: false,
      genericTitle: copy.genericTitle,
      genericBody: copy.genericBody,
    );
    if (!await _prefs.asked) {
      _needsPrompt = preview.isNotEmpty || await _hasReadyActions();
      _emit();
      return;
    }
    _needsPrompt = false;
    final permitted = await _host.hasPermission();
    if (await _prefs.enabled && permitted) {
      final plans = planDueReminders(
        rows: rows,
        now: _now(),
        showLockScreenDetail: await _prefs.lockScreenDetail,
        genericTitle: copy.genericTitle,
        genericBody: copy.genericBody,
      );
      await _host.replaceAll(plans);
      SyncDebugLog.lastDueScheduled = plans.length;
    } else {
      await _host.replaceAll([]);
      SyncDebugLog.lastDueScheduled = 0;
    }
    if (permitted) {
      await _notifyReadyActions(copy);
    } else {
      for (final id in _notifiedReadyIds) {
        await _host.cancel(id);
      }
      _notifiedReadyIds.clear();
      SyncDebugLog.lastReadyActions = 0;
    }
    _emit();
  }

  Future<bool> _hasReadyActions() async {
    final rows = await _config.localStore.listByCollection(pendingActionsCollection);
    for (final row in rows) {
      if (LocalBrainStore.rowIsPendingDelete(row)) continue;
      if (pendingActionIsReady(pendingActionPayloadOf(row))) return true;
    }
    return false;
  }

  Future<void> _notifyReadyActions(DueReminderCopy copy) async {
    final rows = await _config.localStore.listByCollection(pendingActionsCollection);
    final readyIds = <String>{};
    for (final row in rows) {
      if (LocalBrainStore.rowIsPendingDelete(row)) continue;
      final payload = pendingActionPayloadOf(row);
      if (!pendingActionIsReady(payload)) continue;
      final recordId = row['record_id']?.toString() ?? '';
      if (recordId.isEmpty) continue;
      readyIds.add(recordId);
    }
    for (final gone in _notifiedReadyIds.difference(readyIds)) {
      await _host.cancel(gone);
    }
    for (final recordId in readyIds.difference(_notifiedReadyIds)) {
      await _host.showNow(
        DueReminderPlan(
          recordId: recordId,
          fireAt: _now(),
          title: copy.actionReadyTitle,
          body: copy.actionReadyBody,
        ),
      );
    }
    _notifiedReadyIds
      ..clear()
      ..addAll(readyIds);
    SyncDebugLog.lastReadyActions = readyIds.length;
  }

  Future<List<Map<String, dynamic>>> _dueCandidateRows() async {
    final rows = await _config.localStore.listByCollection('tasks');
    return rows.where((row) {
      final id = row['record_id']?.toString() ?? '';
      if (id.isEmpty || isSyncControlTaskRecord(id)) return false;
      return !LocalBrainStore.rowIsPendingDelete(row);
    }).toList();
  }

  Future<void> acceptPrompt(DueReminderCopy copy) async {
    await _prefs.setAsked();
    await _prefs.setEnabled(true);
    await _host.requestPermission();
    _needsPrompt = false;
    await reconcile(copy: copy);
  }

  Future<void> deferPrompt() async {
    await _prefs.setAsked();
    await _prefs.setEnabled(false);
    _needsPrompt = false;
    await _host.cancelAll();
    notifyListeners();
  }

  Future<void> setEnabled(bool value, DueReminderCopy copy) async {
    await _prefs.setEnabled(value);
    if (value) {
      await _prefs.setAsked();
      await _host.requestPermission();
    }
    await reconcile(copy: copy);
  }

  Future<void> setLockScreenDetail(bool value, DueReminderCopy copy) async {
    await _prefs.setLockScreenDetail(value);
    await reconcile(copy: copy);
  }

  @override
  void dispose() {
    _alive = false;
    _config.removeListener(_onConfig);
    unawaited(_tapSub?.cancel());
    super.dispose();
  }
}
