import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import 'inbox_copy.dart';

class InboxNudgeCard extends StatelessWidget {
  const InboxNudgeCard({
    super.key,
    required this.payload,
    required this.onDismiss,
  });

  final Map<String, dynamic> payload;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final copy = InboxCopy.of(context);
    final title = payload['title']?.toString().trim() ?? '';
    final body = payload['body']?.toString().trim() ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: ExoSpacing.md),
      child: ExoSurface(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title.isNotEmpty)
              Text(title, style: Theme.of(context).textTheme.titleSmall),
            if (body.isNotEmpty) ...[
              const SizedBox(height: ExoSpacing.xs),
              Text(body, style: Theme.of(context).textTheme.bodySmall),
            ],
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: onDismiss, child: Text(copy.dismiss)),
            ),
          ],
        ),
      ),
    );
  }
}

class InboxFailureCard extends StatelessWidget {
  const InboxFailureCard({
    super.key,
    required this.payload,
    required this.onDismiss,
  });

  final Map<String, dynamic> payload;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final copy = InboxCopy.of(context);
    final goal = payload['goal']?.toString().trim() ?? '';
    final outcome = payload['outcome']?.toString().trim() ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: ExoSpacing.md),
      child: ExoSurface(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (goal.isNotEmpty) ...[
              ExoSectionLabel(copy.failureAsk),
              const SizedBox(height: ExoSpacing.xs),
              Text(goal, style: Theme.of(context).textTheme.titleSmall),
            ],
            if (outcome.isNotEmpty) ...[
              const SizedBox(height: ExoSpacing.sm),
              Text(outcome, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: ExoSpacing.sm),
            Text(copy.failureHint, style: Theme.of(context).textTheme.bodySmall),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: onDismiss, child: Text(copy.dismiss)),
            ),
          ],
        ),
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
