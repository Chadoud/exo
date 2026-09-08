import 'package:flutter/material.dart';

/// Flat brand palette — white canvas, navy type and CTAs.
abstract final class ExoColors {
  static const brandPrimary = Color(0xFF0F0B2E);
  static const brandSecondary = Color(0xFF2A2554);
  static const brandDeep = Color(0xFF0F0B2E);

  /// Single app canvas — scaffold, nav, app bar, inputs.
  static const bgPrimary = Color(0xFFFFFFFF);

  /// Alias kept for call sites; same solid as [bgPrimary] (no layered wash).
  static const bgSecondary = bgPrimary;

  static const bgElevated = Color(0xFFF5F4FA);

  static const textPrimary = Color(0xFF0F0B2E);
  static const textSecondary = Color(0xFF4A4768);
  static const textMuted = Color(0xFF7A7694);

  static const buttonPrimary = Color(0xFF0F0B2E);
  static const onButton = Color(0xFFFFFFFF);
  static const border = Color(0xFFE4E2EE);
  static const borderStrong = Color(0xFFC8C4D8);

  static const success = Color(0xFF3D9B6E);
  static const error = Color(0xFFE05757);
  static const warning = Color(0xFFD99A2B);

  /// Alias used by existing call sites.
  static Color get bgCard => bgElevated;

  static Color get accentLight => brandPrimary.withValues(alpha: 0.12);

  static Color get errorSoft => error.withValues(alpha: 0.12);
}
