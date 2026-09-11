import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:exosites_mobile/design/exo_colors.dart';
import 'package:exosites_mobile/design/exo_palette.dart';
import 'package:exosites_mobile/design/exo_theme.dart';

import 'support/product_theme.dart';

/// WCAG relative luminance, then the standard (L1+0.05)/(L2+0.05) ratio.
double _contrast(Color a, Color b) {
  double channel(double v) {
    return v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4) as double;
  }

  double luminance(Color c) {
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }

  final la = luminance(a);
  final lb = luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

void main() {
  test('dark palette matches desktop :root tokens', () {
    expect(ExoColors.bgPrimary, const Color(0xFF0F0B2E));
    expect(ExoColors.bgSecondary, const Color(0xFF0A0619));
    expect(ExoColors.textPrimary, const Color(0xFFEEF2FF));
    expect(ExoColors.selected, const Color(0xFFFFFFFF));
    expect(ExoColors.buttonPrimary, const Color(0xFF2A2554));
  });

  test('light palette matches desktop [data-theme="light"] tokens', () {
    expect(ExoLightColors.bgPrimary, const Color(0xFFF0F2F8));
    expect(ExoLightColors.bgElevated, const Color(0xFFFFFFFF));
    expect(ExoLightColors.textPrimary, const Color(0xFF0F0B2E));
    expect(ExoLightColors.buttonPrimary, const Color(0xFF0F0B2E));
    expect(ExoLightColors.onButton, const Color(0xFFEEF2FF));
    expect(ExoLightColors.border, const Color(0xFFDDE1F0));
  });

  test('ExoTheme.product matches light()', () {
    final product = ExoTheme.product();
    final light = ExoTheme.light();
    expect(product.brightness, light.brightness);
    expect(product.scaffoldBackgroundColor, light.scaffoldBackgroundColor);
    expect(product.extension<ExoPalette>()?.cubeStroke, ExoPalette.light.cubeStroke);
  });

  test('the app ships light (desktop default)', () {
    final theme = productTheme();
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, ExoLightColors.bgPrimary);
    expect(theme.colorScheme.surface, ExoLightColors.bgPrimary);
    expect(theme.appBarTheme.backgroundColor, ExoLightColors.bgPrimary);
    expect(theme.appBarTheme.foregroundColor, ExoLightColors.textPrimary);
    expect(theme.cardTheme.color, ExoLightColors.bgElevated);
    expect(theme.extension<ExoPalette>(), isNotNull);
  });

  test('light nav paints a navy island with a pale glyph', () {
    final theme = productTheme();
    expect(theme.navigationBarTheme.indicatorColor, ExoLightColors.buttonPrimary);
    final selectedIcon = theme.navigationBarTheme.iconTheme?.resolve({
      WidgetState.selected,
    });
    expect(selectedIcon?.color, ExoLightColors.onButton);
    expect(selectedIcon?.color, isNot(ExoLightColors.bgPrimary));
    expect(selectedIcon?.color, isNot(theme.navigationBarTheme.indicatorColor));
  });

  test('a selected chip stays legible on its card', () {
    final palette = ExoPalette.light;
    expect(palette.selectedInk, isNot(palette.bgElevated));
    expect(_contrast(palette.selectedInk, palette.bgElevated), greaterThan(4.5));
    expect(palette.accentLight, isNot(palette.selectedInk));
  });

  test('light ink clears WCAG AA on the surfaces it lands on', () {
    final palette = ExoPalette.light;
    const canvas = ExoLightColors.bgPrimary;
    final card = palette.bgElevated;

    expect(_contrast(ExoLightColors.textPrimary, canvas), greaterThan(4.5));
    expect(_contrast(ExoLightColors.textPrimary, card), greaterThan(4.5));
    expect(_contrast(palette.textSecondary, canvas), greaterThan(4.5));
    expect(_contrast(ExoLightColors.onButton, ExoLightColors.buttonPrimary), greaterThan(4.5));
  });

  test('bodySmall uses the ink that clears AA on the canvas', () {
    final theme = productTheme();
    expect(theme.textTheme.bodySmall?.color, ExoLightColors.textSecondary);
  });

  testWidgets('ExoPalette.of falls back to light when extension is missing', (
    tester,
  ) async {
    ExoPalette? captured;
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(useMaterial3: true),
        home: Builder(
          builder: (context) {
            captured = ExoPalette.of(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );
    expect(captured!.cubeStroke, ExoPalette.light.cubeStroke);
  });

  test('dark theme still builds with its own palette', () {
    final theme = ExoTheme.dark();
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, ExoColors.bgPrimary);
    expect(theme.appBarTheme.foregroundColor, ExoColors.selected);
    expect(theme.extension<ExoPalette>()?.onNav, ExoColors.selected);
    expect(_contrast(ExoColors.textPrimary, ExoColors.bgPrimary), greaterThan(4.5));
  });
}
