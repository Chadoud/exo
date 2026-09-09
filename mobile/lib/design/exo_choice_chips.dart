import 'package:flutter/material.dart';

import 'exo_palette.dart';
import 'exo_spacing.dart';
import 'exo_theme.dart';

/// In-page children of a bottom tab — not a second navigation bar.
class ExoChoiceChips<T> extends StatelessWidget {
  const ExoChoiceChips({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  final List<(T value, String label)> options;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    final palette = ExoPalette.of(context);
    return Wrap(
      spacing: ExoSpacing.sm,
      runSpacing: ExoSpacing.sm,
      children: [
        for (final option in options)
          ChoiceChip(
            label: Text(option.$2),
            selected: option.$1 == selected,
            showCheckmark: false,
            onSelected: (_) => onSelected(option.$1),
            materialTapTargetSize: MaterialTapTargetSize.padded,
            padding: const EdgeInsets.symmetric(
              horizontal: ExoSpacing.md,
              vertical: ExoSpacing.sm,
            ),
            labelStyle: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: option.$1 == selected
                  ? palette.selectedInk
                  : palette.textMuted,
            ),
            selectedColor: palette.accentLight,
            backgroundColor: palette.bgElevated,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(ExoTheme.radius),
            ),
            side: BorderSide(
              color: option.$1 == selected
                  ? palette.selectedInk
                  : palette.border,
            ),
          ),
      ],
    );
  }
}
