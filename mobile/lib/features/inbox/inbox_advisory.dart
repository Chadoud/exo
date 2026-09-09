import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import 'inbox_copy.dart';
import 'inbox_expand_card.dart';

class InboxNudgeCard extends StatelessWidget {
  const InboxNudgeCard({
    super.key,
    required this.payload,
    required this.onDismiss,
    this.dueDays,
  });

  final Map<String, dynamic> payload;
  final VoidCallback onDismiss;
  final int? dueDays;

  @override
  Widget build(BuildContext context) {
    final copy = InboxCopy.of(context);
    final title = payload['title']?.toString().trim() ?? '';
    final body = payload['body']?.toString().trim() ?? '';
    return InboxExpandCard(
      title: title.isNotEmpty ? title : copy.needsLook,
      subtitle: body,
      dueDays: dueDays,
      french: copy.locale.languageCode == 'fr',
      child: Align(
        alignment: Alignment.centerRight,
        child: TextButton(onPressed: onDismiss, child: Text(copy.dismiss)),
      ),
    );
  }
}

class InboxFailureCard extends StatelessWidget {
  const InboxFailureCard({
    super.key,
    required this.payload,
    required this.onDismiss,
    this.dueDays,
  });

  final Map<String, dynamic> payload;
  final VoidCallback onDismiss;
  final int? dueDays;

  @override
  Widget build(BuildContext context) {
    final copy = InboxCopy.of(context);
    final goal = payload['goal']?.toString().trim() ?? '';
    final outcome = payload['outcome']?.toString().trim() ?? '';
    return InboxExpandCard(
      title: goal.isNotEmpty ? goal : copy.failureAsk,
      subtitle: outcome,
      dueDays: dueDays,
      french: copy.locale.languageCode == 'fr',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(copy.failureHint, style: Theme.of(context).textTheme.bodySmall),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: onDismiss, child: Text(copy.dismiss)),
          ),
        ],
      ),
    );
  }
}

class InboxAdvisorySection extends StatelessWidget {
  const InboxAdvisorySection({
    super.key,
    required this.label,
    required this.children,
  });

  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, ExoSpacing.sm, ExoSpacing.lg, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ExoSectionLabel(label),
          const SizedBox(height: ExoSpacing.sm),
          ...children,
        ],
      ),
    );
  }
}
