import 'package:exosites_mobile/design/exo_cube_draw.dart';
import 'package:exosites_mobile/design/exo_cube_svg.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('cube path geometry has measurable stroke length', () {
    expect(exoCubeOuterPathLength(), greaterThan(80));
    expect(exoCubeInnerPathLength(), greaterThan(40));
  });

  testWidgets('ExoCubeDraw paints at progress 0 and 1', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoCubeDraw(progress: 0, size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeDraw), findsOneWidget);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoCubeDraw(progress: 1, size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeDraw), findsOneWidget);
  });

  testWidgets('ExoCubeIntro completes and calls onComplete', (tester) async {
    var done = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ExoCubeIntro(
            duration: const Duration(milliseconds: 200),
            crossfadeDuration: const Duration(milliseconds: 100),
            onComplete: () => done = true,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(done, isFalse);
    await tester.pump(const Duration(milliseconds: 120));
    expect(done, isTrue);
    expect(find.byType(ExoCubeSvg), findsOneWidget);
  });

  test('stroke geometry matches SVG face vertices', () {
    // Outer hex matches filled SVG paths in assets/exo_cube.svg (viewBox 48×48).
    expect(exoCubeOuterPathLength(), closeTo(114.0, 8.0));
    expect(exoCubeInnerPathLength(), closeTo(76.0, 8.0));
  });
}

