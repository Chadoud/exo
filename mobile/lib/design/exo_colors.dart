import 'package:flutter/material.dart';

/// Desktop `:root` dark tokens ([frontend/src/styles/tokens.css]).
abstract final class ExoColors {
  static const brandPrimary = Color(0xFF0F0B2E);
  static const brandSecondary = Color(0xFF2A2554);
  static const brandDeep = Color(0xFF0F0B2E);

  /// Scaffold / app bar / nav — `--bg-primary`.
  static const bgPrimary = Color(0xFF0F0B2E);

  /// Recessed wells — `--bg-secondary`.
  static const bgSecondary = Color(0xFF0A0619);

  /// Cards — `--bg-card` (88% primary + 12% secondary brand).
  static const bgElevated = Color(0xFF120E33);

  static const textPrimary = Color(0xFFEEF2FF);
  static const textSecondary = Color(0xFFB3B4CC);
  static const textMuted = Color(0xFF9696B2);

  /// Selected nav / glyphs on the navy canvas (desktop `text-white`).
  static const selected = Color(0xFFFFFFFF);

  /// Visible CTA on the navy canvas (`--color-button-primary-hover`).
  static const buttonPrimary = Color(0xFF2A2554);
  static const onButton = Color(0xFFEEF2FF);

  /// `color-mix(#2a2554 70%, #0f0b2e 30%)`.
  static const border = Color(0xFF221D49);
  static const borderStrong = Color(0xFF2A2554);

  static const success = Color(0xFF4CAF7D);
  static const error = Color(0xFFEF5350);
  static const warning = Color(0xFFF5A623);

  /// Lifted navy — `--accent` (`#fff` 62% + brand 38%).
  static const accent = Color(0xFFA4A2B0);

  static Color get bgCard => bgElevated;

  static Color get accentLight => brandSecondary.withValues(alpha: 0.22);

  static Color get errorSoft => error.withValues(alpha: 0.14);
}

/// Desktop `[data-theme="light"]` — the shipped phone palette.
abstract final class ExoLightColors {
  static const bgPrimary = Color(0xFFF0F2F8);
  static const bgSecondary = Color(0xFFFFFFFF);
  static const bgElevated = Color(0xFFFFFFFF);
  static const textPrimary = Color(0xFF0F0B2E);
  static const textSecondary = Color(0xFF4A4E5C);
  static const textMuted = Color(0xFF6B7280);

  /// Selected chips / checkboxes / focus rings on the pale canvas.
  static const selected = Color(0xFF0F0B2E);

  static const buttonPrimary = Color(0xFF0F0B2E);
  static const onButton = Color(0xFFEEF2FF);
  static const border = Color(0xFFDDE1F0);
  static const borderStrong = Color(0xFFC8C4D8);
  static const accent = Color(0xFF0F0B2E);
  static const success = Color(0xFF2E9E5E);
  static const error = Color(0xFFDC2626);
  static const warning = Color(0xFFD97706);

  static Color get accentLight => accent.withValues(alpha: 0.10);

  static Color get errorSoft => error.withValues(alpha: 0.12);
}
