import 'package:flutter/material.dart';

import '../../design/due_day_badge.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';

/// Collapsed header that opens the rest of an Inbox card.
class InboxExpandCard extends StatefulWidget {
  const InboxExpandCard({
    super.key,
    required this.title,
    this.subtitle,
    this.dueDays,
    this.french = false,
    this.initiallyExpanded = false,
    required this.child,
  });

  final String title;
  final String? subtitle;
  final int? dueDays;
  final bool french;
  final bool initiallyExpanded;
  final Widget child;

  @override
  State<InboxExpandCard> createState() => _InboxExpandCardState();
}

class _InboxExpandCardState extends State<InboxExpandCard> {
  late bool _open = widget.initiallyExpanded;

  @override
  void didUpdateWidget(covariant InboxExpandCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initiallyExpanded && !_open) {
      _open = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = widget.subtitle?.trim() ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: ExoSpacing.md),
      child: DueDayCardStack(
        days: widget.dueDays,
        french: widget.french,
        child: ExoSurface(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              InkWell(
                onTap: () => setState(() => _open = !_open),
                child: Padding(
                  padding: const EdgeInsets.all(ExoSpacing.lg),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.title,
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                            if (subtitle.isNotEmpty) ...[
                              const SizedBox(height: ExoSpacing.xs),
                              Text(
                                subtitle,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ],
                        ),
                      ),
                      Icon(_open ? Icons.expand_less : Icons.expand_more),
                    ],
                  ),
                ),
              ),
              if (_open)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    ExoSpacing.lg,
                    0,
                    ExoSpacing.lg,
                    ExoSpacing.lg,
                  ),
                  child: widget.child,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
