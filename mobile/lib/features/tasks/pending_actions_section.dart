import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_theme.dart';
import '../../design/exo_widgets.dart';
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
    this.focusRecordId,
  });

  final MobileSyncConfig config;
  final List<Map<String, dynamic>> rows;
  final VoidCallback? onChanged;
  final String? focusRecordId;

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

  TextEditingController _ctrl(
    Map<String, TextEditingController> map,
    String id,
    String text,
  ) {
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
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(copy.actionSend),
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
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(copy.actionWaitingDesktop)));
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
          ExoSectionLabel(copy.actionSection),
          const SizedBox(height: ExoSpacing.sm),
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
    final inboundSubject = pendingActionInboundSubject(payload);
    final inboundSnippet = pendingActionInboundSnippet(payload);
    final stale = status == 'stale_thread' || status == 'needs_desktop';
    final waiting = status == 'confirmed';
    final ready = pendingActionIsReady(payload);
    final focused = recordId.isNotEmpty && recordId == widget.focusRecordId;
    return Padding(
      padding: const EdgeInsets.only(bottom: ExoSpacing.md),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(ExoTheme.radius),
          border: focused ? Border.all(color: ExoColors.brandPrimary, width: 2) : null,
        ),
        child: ExoSurface(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              copy.actionCardTitleFor(ready: ready, waiting: waiting, stale: stale),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (to.isNotEmpty) ...[
              const SizedBox(height: ExoSpacing.xs),
              Text(to, style: Theme.of(context).textTheme.bodySmall),
            ],
            if (ready) ...[
              const SizedBox(height: ExoSpacing.xs),
              Text(copy.actionCardHint, style: Theme.of(context).textTheme.bodySmall),
            ],
            if (stale)
              Text(copy.actionStale, style: Theme.of(context).textTheme.bodySmall),
            if (waiting)
              Text(copy.actionWaitingDesktop, style: Theme.of(context).textTheme.bodySmall),
            if (inboundSubject.isNotEmpty || inboundSnippet.isNotEmpty) ...[
              const SizedBox(height: ExoSpacing.md),
              ExoSectionLabel(copy.actionContext),
              const SizedBox(height: ExoSpacing.sm),
              _InboundBlock(subject: inboundSubject, snippet: inboundSnippet),
            ],
            if (ready) ...[
              const SizedBox(height: ExoSpacing.md),
              ExoSectionLabel(copy.actionReply),
              const SizedBox(height: ExoSpacing.sm),
              TextField(
                controller: subjectCtrl,
                style: const TextStyle(color: ExoColors.textPrimary),
                decoration: InputDecoration(
                  labelText: copy.actionSubject,
                  filled: true,
                  fillColor: ExoColors.bgPrimary,
                ),
              ),
              const SizedBox(height: ExoSpacing.sm),
              TextField(
                controller: bodyCtrl,
                maxLines: 8,
                minLines: 4,
                style: const TextStyle(color: ExoColors.textPrimary),
                decoration: InputDecoration(
                  labelText: copy.actionBody,
                  filled: true,
                  fillColor: ExoColors.bgPrimary,
                ),
              ),
              const SizedBox(height: ExoSpacing.md),
              Align(
                alignment: Alignment.centerRight,
                child: ExoPrimaryButton(
                  label: copy.actionSend,
                  onPressed: recordId.isEmpty ? null : () => _confirm(recordId, payload),
                ),
              ),
            ],
          ],
        ),
        ),
      ),
    );
  }
}

class _InboundBlock extends StatelessWidget {
  const _InboundBlock({required this.subject, required this.snippet});

  final String subject;
  final String snippet;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: ExoColors.bgPrimary,
        borderRadius: BorderRadius.circular(ExoTheme.radius),
        border: Border.all(color: ExoColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(ExoSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (subject.isNotEmpty)
              Text(subject, style: Theme.of(context).textTheme.titleSmall),
            if (snippet.isNotEmpty) ...[
              if (subject.isNotEmpty) const SizedBox(height: ExoSpacing.sm),
              SelectableText(snippet, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ],
        ),
      ),
    );
  }
}
