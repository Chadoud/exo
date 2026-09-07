import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../notifications/due_reminder_copy.dart';
import '../../notifications/sync_debug_log.dart';
import '../../sync/pending_action_edits.dart';
import '../../sync/pending_action_payload.dart';
import '../../sync/user_messages.dart';

class PendingActionsSection extends StatefulWidget {
  const PendingActionsSection({
    super.key,
    required this.config,
    required this.rows,
    this.onChanged,
  });

  final MobileSyncConfig config;
  final List<Map<String, dynamic>> rows;
  final VoidCallback? onChanged;

  @override
  State<PendingActionsSection> createState() => _PendingActionsSectionState();
}

class _PendingActionsSectionState extends State<PendingActionsSection> {
  final _subject = <String, TextEditingController>{};
  final _body = <String, TextEditingController>{};

  @override
  void dispose() {
    for (final c in _subject.values) {
      c.dispose();
    }
    for (final c in _body.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _ctrl(Map<String, TextEditingController> map, String id, String text) {
    return map.putIfAbsent(id, () => TextEditingController(text: text));
  }

  Future<void> _confirm(String recordId, Map<String, dynamic> payload) async {
    final copy = DueReminderCopy.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(copy.actionConfirmTitle),
        content: Text(copy.actionConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(SyncUserMessages.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(copy.permissionAllow),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final subject = _subject[recordId]?.text ?? payload['subject']?.toString() ?? '';
    final body = _body[recordId]?.text ?? payload['body']?.toString() ?? '';
    final now = DateTime.now().toUtc().toIso8601String();
    final changed = await applyPendingActionConfirm(
      store: widget.config.localStore,
      recordId: recordId,
      subject: subject,
      body: body,
      now: now,
      deviceId: widget.config.deviceIdSync,
    );
    if (!changed) return;
    SyncDebugLog.note('pending_confirm:$recordId');
    unawaited(widget.config.engine.pushPendingEdits().catchError((_) {
      SyncDebugLog.note('pending_push_failed');
      return 0;
    }));
    if (!mounted) return;
    widget.config.markLocalDataChanged();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(copy.actionWaitingDesktop)));
    widget.onChanged?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.rows.isEmpty) return const SizedBox.shrink();
    final copy = DueReminderCopy.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, ExoSpacing.sm, ExoSpacing.lg, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final row in widget.rows) _card(row, copy),
        ],
      ),
    );
  }

  Widget _card(Map<String, dynamic> row, DueReminderCopy copy) {
    final recordId = row['record_id']?.toString() ?? '';
    final payload = pendingActionPayloadOf(row);
    final status = payload['status']?.toString() ?? '';
    final to = [
      payload['to_name']?.toString() ?? '',
      payload['to_email']?.toString() ?? '',
    ].where((s) => s.isNotEmpty).join(' · ');
    final subjectCtrl = _ctrl(_subject, recordId, payload['subject']?.toString() ?? '');
    final bodyCtrl = _ctrl(_body, recordId, payload['body']?.toString() ?? '');
    final stale = status == 'stale_thread' || status == 'needs_desktop';
    final waiting = status == 'confirmed';
    return Padding(
      padding: const EdgeInsets.only(bottom: ExoSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(copy.actionReadyTitle, style: Theme.of(context).textTheme.titleSmall),
          if (to.isNotEmpty) Text(to, style: Theme.of(context).textTheme.bodySmall),
          if (stale) Text(copy.actionStale, style: Theme.of(context).textTheme.bodySmall),
          if (waiting) Text(copy.actionWaitingDesktop, style: Theme.of(context).textTheme.bodySmall),
          if (pendingActionIsReady(payload)) ...[
            TextField(controller: subjectCtrl, decoration: const InputDecoration(labelText: 'Subject')),
            TextField(
              controller: bodyCtrl,
              maxLines: 6,
              decoration: const InputDecoration(labelText: 'Body'),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: recordId.isEmpty ? null : () => _confirm(recordId, payload),
                child: Text(copy.actionConfirmTitle),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
