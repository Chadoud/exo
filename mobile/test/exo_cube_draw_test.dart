import 'package:exosites_mobile/design/exo_cube_draw.dart';
import 'package:exosites_mobile/design/exo_cube_svg.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('cube one-path has measurable stroke length', () {
    expect(exoCubeDrawPathLength(), greaterThan(400));
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

  testWidgets('ExoCubeIntro completes after stroke draw + settle', (tester) async {
    var done = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ExoCubeIntro(
            duration: const Duration(milliseconds: 200),
            settleDuration: const Duration(milliseconds: 100),
            onComplete: () => done = true,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    expect(done, isFalse);
    await tester.pump(const Duration(milliseconds: 200));
    expect(done, isFalse);
    await tester.pump(const Duration(milliseconds: 100));
    expect(done, isTrue);
    expect(find.byType(ExoCubeIntro), findsOneWidget);
    // Hold is the same stroke painter — never a PNG brand mark.
    expect(find.byType(ExoCubeDraw), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('ExoBootScreen does not show PNG mark while holding', (tester) async {
    var done = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ExoBootScreen(
          introDuration: const Duration(milliseconds: 200),
          settleDuration: const Duration(milliseconds: 100),
          onIntroComplete: () => done = true,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    expect(done, isFalse);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 100));
    expect(done, isTrue);
    expect(find.byType(ExoCubeDraw), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    expect(find.byType(ExoCubeSvg), findsNothing);
  });

  test('stroke geometry matches brand one-path proportions', () {
    // Full `#cube-draw-path` length in viewBox units (133×150).
    expect(exoCubeDrawPathLength(), closeTo(728.0, 20.0));
  });

  testWidgets('ExoCubeSvg mark matches full stroke draw', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoCubeSvg(size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeDraw), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });
}
