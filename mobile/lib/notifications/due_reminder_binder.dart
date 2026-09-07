import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import '../app/mobile_sync_config.dart';
import 'due_reminder_controller.dart';
import 'due_reminder_copy.dart';
import 'due_reminder_host.dart';
import 'due_reminder_scope.dart';
import 'task_deep_link.dart';

/// Owns reminder scheduling + permission prompt + task deep links.
class DueReminderBinder extends StatefulWidget {
  const DueReminderBinder({
    super.key,
    required this.config,
    required this.child,
    this.host,
    this.appLinks,
    this.onOpenTask,
  });

  final MobileSyncConfig config;
  final Widget child;
  final DueReminderHost? host;
  final AppLinks? appLinks;
  final ValueChanged<String>? onOpenTask;

  @override
  State<DueReminderBinder> createState() => _DueReminderBinderState();
}

class _DueReminderBinderState extends State<DueReminderBinder> {
  late final DueReminderHost _host = widget.host ?? MemoryDueReminderHost();
  late final DueReminderController _controller = DueReminderController(
    config: widget.config,
    host: _host,
  );
  StreamSubscription<Uri>? _linkSub;
  bool _promptOpen = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onController);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_controller.reconcile(copy: DueReminderCopy.of(context)));
    });
    unawaited(_listenLinks());
  }

  @override
  void dispose() {
    unawaited(_linkSub?.cancel());
    _controller.removeListener(_onController);
    _controller.dispose();
    super.dispose();
  }

  Future<void> _listenLinks() async {
    final links = widget.appLinks ??
        (widget.host == null || widget.host is MemoryDueReminderHost
            ? null
            : AppLinks());
    if (links == null) return;
    try {
      final initial = await links.getInitialLink();
      if (initial != null) _onLink(initial);
    } catch (_) {}
    _linkSub = links.uriLinkStream.listen(_onLink);
  }

  void _onLink(Uri uri) {
    final taskId = taskRecordIdFromUri(uri);
    if (taskId != null) {
      _emitTask(taskId);
      return;
    }
    if (opensTasksFromUri(uri)) widget.onOpenTask?.call('');
  }

  void _onController() {
    if (_controller.consumeOpenTasks()) widget.onOpenTask?.call('');
    final opened = _controller.consumeOpenedTaskId();
    if (opened != null) _emitTask(opened);
    if (_controller.needsPrompt) unawaited(_showPrompt());
  }

  void _emitTask(String? recordId) {
    if (recordId == null || recordId.isEmpty) return;
    widget.onOpenTask?.call(recordId);
  }

  Future<void> _showPrompt() async {
    if (!mounted || _promptOpen || !_controller.needsPrompt) return;
    _promptOpen = true;
    final copy = DueReminderCopy.of(context);
    bool? allow;
    try {
      allow = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(copy.permissionTitle),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(copy.permissionLater),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(copy.permissionAllow),
            ),
          ],
        ),
      );
    } finally {
      _promptOpen = false;
    }
    if (!mounted) return;
    if (allow == true) {
      await _controller.acceptPrompt(copy);
    } else {
      await _controller.deferPrompt();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DueReminderScope(
      controller: _controller,
      child: widget.child,
    );
  }
}
