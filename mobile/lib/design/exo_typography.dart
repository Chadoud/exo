import 'package:flutter/material.dart';

/// The type ramp is identical in both themes — only the ink changes.
///
/// [metaText] is the ink for `bodySmall`. It is deliberately separate from
/// [textMuted]: muted grey is fine for 14pt+ copy but drops under 4.5:1 at
/// 12pt on the pale canvas, so light passes its secondary ink here.
TextTheme exoTextTheme({
  required Color textPrimary,
  required Color textSecondary,
  required Color textMuted,
  required Color metaText,
}) {
  return TextTheme(
    displaySmall: TextStyle(
      fontSize: 32,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.8,
      height: 1.15,
      color: textPrimary,
    ),
    headlineSmall: TextStyle(
      fontSize: 22,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.4,
      height: 1.25,
      color: textPrimary,
    ),
    titleLarge: TextStyle(
      fontSize: 18,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.3,
      color: textPrimary,
    ),
    titleMedium: TextStyle(
      fontSize: 15,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.2,
      color: textPrimary,
    ),
    bodyLarge: TextStyle(
      fontSize: 16,
      height: 1.5,
      letterSpacing: -0.1,
      color: textPrimary,
    ),
    bodyMedium: TextStyle(
      fontSize: 14,
      height: 1.45,
      color: textSecondary,
    ),
    bodySmall: TextStyle(
      fontSize: 12,
      height: 1.4,
      color: metaText,
    ),
    labelLarge: TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.2,
      color: textSecondary,
    ),
    labelMedium: TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w500,
      color: textMuted,
    ),
  );
}
