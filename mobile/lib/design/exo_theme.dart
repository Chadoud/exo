import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'exo_colors.dart';
import 'exo_palette.dart';
import 'exo_spacing.dart';
import 'exo_typography.dart';

/// Surfaces + type — same tokens as desktop `tokens.css`.
abstract final class ExoTheme {
  /// Cards, CTAs, chips.
  static const double radius = 12;

  /// Text fields and other inset controls.
  static const double radiusInput = 10;

  /// The app default.
  static ThemeData light() {
    return _build(
      brightness: Brightness.light,
      overlayStyle: SystemUiOverlayStyle.dark,
      palette: ExoPalette.light,
      bgPrimary: ExoLightColors.bgPrimary,
      textPrimary: ExoLightColors.textPrimary,
      metaText: ExoLightColors.textSecondary,
      buttonPrimary: ExoLightColors.buttonPrimary,
      onButton: ExoLightColors.onButton,
      accent: ExoLightColors.accent,
      primary: ExoLightColors.accent,
      appBarInk: ExoLightColors.textPrimary,
      navIndicator: ExoLightColors.buttonPrimary,
      snackBg: ExoLightColors.buttonPrimary,
      snackFg: ExoLightColors.onButton,
      error: ExoLightColors.error,
    );
  }

  /// Kept wired so the dark tokens stay compiled and testable.
  static ThemeData dark() {
    return _build(
      brightness: Brightness.dark,
      overlayStyle: SystemUiOverlayStyle.light,
      palette: ExoPalette.dark,
      bgPrimary: ExoColors.bgPrimary,
      textPrimary: ExoColors.textPrimary,
      metaText: ExoColors.textMuted,
      buttonPrimary: ExoColors.buttonPrimary,
      onButton: ExoColors.onButton,
      accent: ExoColors.accent,
      primary: ExoColors.brandSecondary,
      appBarInk: ExoColors.selected,
      navIndicator: const Color(0x1FFFFFFF),
      snackBg: ExoColors.bgSecondary,
      snackFg: ExoColors.textPrimary,
      error: ExoColors.error,
    );
  }

  static ThemeData _build({
    required Brightness brightness,
    required SystemUiOverlayStyle overlayStyle,
    required ExoPalette palette,
    required Color bgPrimary,
    required Color textPrimary,
    required Color metaText,
    required Color buttonPrimary,
    required Color onButton,
    required Color accent,
    required Color primary,
    required Color appBarInk,
    required Color navIndicator,
    required Color snackBg,
    required Color snackFg,
    required Color error,
  }) {
    final bgElevated = palette.bgElevated;
    final border = palette.border;
    final textMuted = palette.textMuted;
    final onNav = palette.onNav;
    final focusRing = BorderSide(color: accent, width: 2);

    final scheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: onButton,
      secondary: accent,
      onSecondary: brightness == Brightness.dark ? bgPrimary : onButton,
      surface: bgPrimary,
      onSurface: textPrimary,
      onSurfaceVariant: palette.textSecondary,
      surfaceTint: Colors.transparent,
      error: error,
      onError: onButton,
      outline: border,
      outlineVariant: border,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      extensions: <ThemeExtension<dynamic>>[palette],
      scaffoldBackgroundColor: bgPrimary,
      focusColor: palette.accentLight,
      dividerColor: border,
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      appBarTheme: AppBarTheme(
        backgroundColor: bgPrimary,
        foregroundColor: appBarInk,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: appBarInk),
        actionsIconTheme: IconThemeData(color: appBarInk),
        titleTextStyle: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
          color: appBarInk,
        ),
        systemOverlayStyle: overlayStyle,
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: appBarInk),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: bgPrimary,
        elevation: 0,
        height: 64,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        indicatorColor: navIndicator,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            letterSpacing: 0.1,
            color: selected ? textPrimary : textMuted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(size: 22, color: selected ? onNav : textMuted);
        }),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: bgPrimary,
        indicatorColor: navIndicator,
        selectedIconTheme: IconThemeData(color: onNav, size: 22),
        unselectedIconTheme: IconThemeData(color: textMuted, size: 22),
        selectedLabelTextStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: textPrimary,
        ),
        unselectedLabelTextStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: textMuted,
        ),
        labelType: NavigationRailLabelType.all,
      ),
      cardTheme: CardThemeData(
        color: bgElevated,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: border),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: bgElevated,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: bgElevated,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: bgElevated,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: textPrimary,
        ),
        contentTextStyle: TextStyle(
          fontSize: 14,
          height: 1.45,
          color: palette.textSecondary,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: buttonPrimary,
          foregroundColor: onButton,
          disabledBackgroundColor: border,
          disabledForegroundColor: textMuted,
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(
            horizontal: ExoSpacing.lg,
            vertical: ExoSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.1,
          ),
        ).copyWith(side: _focusOnly(focusRing)),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textPrimary,
          minimumSize: const Size(48, 48),
          backgroundColor: bgElevated,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.1,
          ),
        ).copyWith(
          side: _focusOnly(focusRing, resting: BorderSide(color: palette.borderStrong)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: accent,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ).copyWith(side: _focusOnly(focusRing)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: bgElevated,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: ExoSpacing.md,
          vertical: ExoSpacing.md,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusInput),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusInput),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusInput),
          borderSide: BorderSide(color: accent, width: 2),
        ),
        labelStyle: TextStyle(color: textMuted),
        hintStyle: TextStyle(color: textMuted),
        prefixIconColor: textMuted,
        suffixIconColor: textMuted,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: textMuted,
        textColor: textPrimary,
        contentPadding: const EdgeInsets.symmetric(horizontal: ExoSpacing.lg),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: snackBg,
        contentTextStyle: TextStyle(color: snackFg, fontSize: 14),
        actionTextColor: snackFg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: accent,
        circularTrackColor: border,
      ),
      textTheme: exoTextTheme(
        textPrimary: textPrimary,
        textSecondary: palette.textSecondary,
        textMuted: textMuted,
        metaText: metaText,
      ),
    );
  }

  /// Keyboard focus has to be visible on a flat light surface, so every button
  /// grows the same navy ring instead of relying on a tint.
  static WidgetStateProperty<BorderSide?> _focusOnly(
    BorderSide ring, {
    BorderSide? resting,
  }) {
    return WidgetStateProperty.resolveWith(
      (states) => states.contains(WidgetState.focused) ? ring : resting,
    );
  }
}
