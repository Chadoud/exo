import 'package:flutter/material.dart';

import 'exo_colors.dart';

/// Top-right day count: primary when due is today or later, red when overdue.
class DueDayBadge extends StatelessWidget {
  const DueDayBadge({super.key, required this.days, this.french = false});

  /// Calendar-day delta from [taskDueDayDelta].
  final int days;
  final bool french;

  bool get overdue => days < 0;

  String get _count => '${days.abs()}';

  String get semanticLabel {
    if (overdue) {
      final n = days.abs();
      if (french) {
        return n == 1 ? 'En retard d’1 jour' : 'En retard de $n jours';
      }
      return n == 1 ? '1 day overdue' : '$n days overdue';
    }
    if (days == 0) return french ? 'Dû aujourd’hui' : 'Due today';
    if (french) {
      return days == 1 ? 'Dû dans 1 jour' : 'Dû dans $days jours';
    }
    return days == 1 ? 'Due in 1 day' : 'Due in $days days';
  }

  @override
  Widget build(BuildContext context) {
    final bg = overdue ? ExoLightColors.error : ExoLightColors.buttonPrimary;
    const fg = ExoLightColors.onButton;
    return Semantics(
      label: semanticLabel,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          child: Text(
            _count,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: fg,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
          ),
        ),
      ),
    );
  }
}

/// Card stack with an optional due-day bubble on the top-right corner.
class DueDayCardStack extends StatelessWidget {
  const DueDayCardStack({
    super.key,
    required this.child,
    this.days,
    this.french = false,
  });

  final Widget child;
  final int? days;
  final bool french;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        child,
        if (days != null)
          Positioned(
            top: -6,
            right: -6,
            child: DueDayBadge(days: days!, french: french),
          ),
      ],
    );
  }
}
