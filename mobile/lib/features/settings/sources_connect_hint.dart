import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../app/settings_copy.dart';

/// Phone cannot OAuth-connect Gmail/Drive — that stays on the computer.
class SourcesConnectHint extends StatelessWidget {
  const SourcesConnectHint({super.key});

  @override
  Widget build(BuildContext context) {
    final copy = SettingsCopy.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExoSectionLabel(copy.sourcesTitle),
        const SizedBox(height: ExoSpacing.sm),
        ExoSurface(
          child: Text(copy.sourcesBody, style: Theme.of(context).textTheme.bodySmall),
        ),
        const SizedBox(height: ExoSpacing.xl),
      ],
    );
  }
}
