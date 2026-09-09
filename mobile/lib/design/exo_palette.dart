import 'package:flutter/material.dart';

import 'exo_colors.dart';

/// Semantic tokens [ColorScheme] has no slot for — card vs recessed well, meta
/// ink, selected wash, cube stroke.
///
/// Widgets read these from context instead of importing a fixed palette, so a
/// screen renders correctly under either theme.
@immutable
class ExoPalette extends ThemeExtension<ExoPalette> {
  const ExoPalette({
    required this.bgElevated,
    required this.well,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.borderStrong,
    required this.accentLight,
    required this.errorSoft,
    required this.selectedInk,
    required this.onNav,
    required this.cubeStroke,
  });

  /// Cards and raised rows — desktop `--bg-card`.
  final Color bgElevated;

  /// Recessed field / quoted-message wells — one step behind [bgElevated].
  final Color well;

  final Color textSecondary;
  final Color textMuted;
  final Color border;
  final Color borderStrong;

  /// Wash behind a selected row or chip.
  final Color accentLight;

  final Color errorSoft;

  /// Ink for selected in-page state: chips, checkboxes, focus rings.
  final Color selectedInk;

  /// Glyph inside the selected navigation indicator (sits on the indicator,
  /// not on the canvas).
  final Color onNav;

  final Color cubeStroke;

  static final dark = ExoPalette(
    bgElevated: ExoColors.bgElevated,
    well: ExoColors.bgPrimary,
    textSecondary: ExoColors.textSecondary,
    textMuted: ExoColors.textMuted,
    border: ExoColors.border,
    borderStrong: ExoColors.borderStrong,
    accentLight: ExoColors.accentLight,
    errorSoft: ExoColors.errorSoft,
    selectedInk: ExoColors.selected,
    onNav: ExoColors.selected,
    cubeStroke: ExoColors.textPrimary,
  );

  static final light = ExoPalette(
    bgElevated: ExoLightColors.bgElevated,
    well: ExoLightColors.bgPrimary,
    textSecondary: ExoLightColors.textSecondary,
    textMuted: ExoLightColors.textMuted,
    border: ExoLightColors.border,
    borderStrong: ExoLightColors.borderStrong,
    accentLight: ExoLightColors.accentLight,
    errorSoft: ExoLightColors.errorSoft,
    selectedInk: ExoLightColors.selected,
    onNav: ExoLightColors.onButton,
    cubeStroke: ExoLightColors.accent,
  );

  static ExoPalette of(BuildContext context) =>
      Theme.of(context).extension<ExoPalette>() ?? light;

  @override
  ExoPalette copyWith({
    Color? bgElevated,
    Color? well,
    Color? textSecondary,
    Color? textMuted,
    Color? border,
    Color? borderStrong,
    Color? accentLight,
    Color? errorSoft,
    Color? selectedInk,
    Color? onNav,
    Color? cubeStroke,
  }) {
    return ExoPalette(
      bgElevated: bgElevated ?? this.bgElevated,
      well: well ?? this.well,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      accentLight: accentLight ?? this.accentLight,
      errorSoft: errorSoft ?? this.errorSoft,
      selectedInk: selectedInk ?? this.selectedInk,
      onNav: onNav ?? this.onNav,
      cubeStroke: cubeStroke ?? this.cubeStroke,
    );
  }

  @override
  ExoPalette lerp(ExoPalette? other, double t) {
    if (other == null) return this;
    return ExoPalette(
      bgElevated: Color.lerp(bgElevated, other.bgElevated, t)!,
      well: Color.lerp(well, other.well, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      accentLight: Color.lerp(accentLight, other.accentLight, t)!,
      errorSoft: Color.lerp(errorSoft, other.errorSoft, t)!,
      selectedInk: Color.lerp(selectedInk, other.selectedInk, t)!,
      onNav: Color.lerp(onNav, other.onNav, t)!,
      cubeStroke: Color.lerp(cubeStroke, other.cubeStroke, t)!,
    );
  }
}
