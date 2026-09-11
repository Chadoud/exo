import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';

/// Centered hero block shared by sign-in and link steps.
class SetupPortalHeader extends StatelessWidget {
  const SetupPortalHeader({
    super.key,
    required this.stepLabel,
    required this.title,
    required this.subtitle,
  });

  final String stepLabel;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Center(child: ExoMark()),
        const SizedBox(height: ExoSpacing.xl),
        ExoSectionLabel(stepLabel),
        const SizedBox(height: ExoSpacing.xs),
        Text(title, style: textTheme.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: ExoSpacing.sm),
        Text(
          subtitle,
          style: textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
