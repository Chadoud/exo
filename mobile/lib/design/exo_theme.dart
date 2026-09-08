import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'exo_colors.dart';
import 'exo_spacing.dart';

/// Flat light theme — white canvas, navy type and CTAs.
abstract final class ExoTheme {
  static const double radius = 10;

  static ThemeData light() {
    const scheme = ColorScheme.light(
      primary: ExoColors.brandPrimary,
      onPrimary: ExoColors.onButton,
      secondary: ExoColors.brandSecondary,
      onSecondary: ExoColors.onButton,
      surface: ExoColors.bgElevated,
      onSurface: ExoColors.textPrimary,
      error: ExoColors.error,
      onError: ExoColors.onButton,
      outline: ExoColors.border,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: scheme,
      scaffoldBackgroundColor: ExoColors.bgPrimary,
      dividerColor: ExoColors.border,
      dividerTheme: const DividerThemeData(
        color: ExoColors.border,
        thickness: 1,
        space: 1,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: ExoColors.bgPrimary,
        foregroundColor: ExoColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
          color: ExoColors.textPrimary,
        ),
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: ExoColors.bgPrimary,
        elevation: 0,
        height: 64,
        indicatorColor: ExoColors.accentLight,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            letterSpacing: 0.1,
            color: selected ? ExoColors.brandPrimary : ExoColors.textMuted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 22,
            color: selected ? ExoColors.brandPrimary : ExoColors.textMuted,
          );
        }),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: ExoColors.bgPrimary,
        indicatorColor: ExoColors.accentLight,
        selectedIconTheme: const IconThemeData(color: ExoColors.brandPrimary, size: 22),
        unselectedIconTheme: const IconThemeData(color: ExoColors.textMuted, size: 22),
        selectedLabelTextStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: ExoColors.brandPrimary,
        ),
        unselectedLabelTextStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: ExoColors.textMuted,
        ),
        labelType: NavigationRailLabelType.all,
      ),
      cardTheme: CardThemeData(
        color: ExoColors.bgElevated,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: const BorderSide(color: ExoColors.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: ExoColors.buttonPrimary,
          foregroundColor: ExoColors.onButton,
          disabledBackgroundColor: ExoColors.border,
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: ExoSpacing.lg, vertical: ExoSpacing.md),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: -0.1),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ExoColors.brandPrimary,
          minimumSize: const Size(48, 48),
          side: const BorderSide(color: ExoColors.borderStrong),
          backgroundColor: ExoColors.bgPrimary,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: -0.1),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: ExoColors.brandPrimary,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: ExoColors.bgElevated,
        contentPadding: const EdgeInsets.symmetric(horizontal: ExoSpacing.md, vertical: ExoSpacing.md),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(radius)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: const BorderSide(color: ExoColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: const BorderSide(color: ExoColors.brandPrimary, width: 1.5),
        ),
        labelStyle: const TextStyle(color: ExoColors.textMuted),
        hintStyle: const TextStyle(color: ExoColors.textMuted),
        prefixIconColor: ExoColors.textMuted,
        suffixIconColor: ExoColors.textMuted,
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: ExoColors.textMuted,
        textColor: ExoColors.textPrimary,
        contentPadding: EdgeInsets.symmetric(horizontal: ExoSpacing.lg),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: ExoColors.brandPrimary,
        contentTextStyle: const TextStyle(color: ExoColors.onButton, fontSize: 14),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: ExoColors.brandPrimary,
        circularTrackColor: ExoColors.border,
      ),
      textTheme: const TextTheme(
        displaySmall: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.8,
          height: 1.15,
          color: ExoColors.textPrimary,
        ),
        headlineSmall: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.4,
          height: 1.25,
          color: ExoColors.textPrimary,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.3,
          color: ExoColors.textPrimary,
        ),
        titleMedium: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
          color: ExoColors.textPrimary,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          height: 1.5,
          letterSpacing: -0.1,
          color: ExoColors.textPrimary,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          height: 1.45,
          color: ExoColors.textSecondary,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          height: 1.4,
          color: ExoColors.textMuted,
        ),
        labelLarge: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
          color: ExoColors.textSecondary,
        ),
      ),
    );
  }

  /// Alias for existing tests and call sites.
  static ThemeData dark() => light();
}
