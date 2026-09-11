import 'package:exosites_mobile/design/exo_cube_draw.dart';
import 'package:exosites_mobile/design/exo_cube_svg.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/product_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('shouldPlayBootIntro is false when the session is already connected', () {
    expect(
      shouldPlayBootIntro(signedIn: false, paired: false, onboardingComplete: false),
      isTrue,
    );
    expect(
      shouldPlayBootIntro(signedIn: true, paired: false, onboardingComplete: false),
      isFalse,
    );
    expect(
      shouldPlayBootIntro(signedIn: false, paired: true, onboardingComplete: false),
      isFalse,
    );
    expect(
      shouldPlayBootIntro(signedIn: false, paired: false, onboardingComplete: true),
      isFalse,
    );
  });

  test('cube one-path has measurable stroke length', () {
    expect(exoCubeDrawPathLength(), greaterThan(400));
  });

  testWidgets('ExoCubeDraw paints at progress 0 and 1', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: productTheme(),
        home: const Scaffold(
          body: Center(child: ExoCubeDraw(progress: 0, size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeDraw), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        theme: productTheme(),
        home: const Scaffold(
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
        theme: productTheme(),
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

  testWidgets('ExoCubeIntro skipAnimation completes without waiting for draw', (tester) async {
    var done = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: productTheme(),
        home: Scaffold(
          body: ExoCubeIntro(
            skipAnimation: true,
            duration: const Duration(milliseconds: 1400),
            settleDuration: const Duration(milliseconds: 280),
            onComplete: () => done = true,
          ),
        ),
      ),
    );
    await tester.pump();
    expect(done, isTrue);
    expect(find.byType(ExoCubeDraw), findsOneWidget);
  });

  testWidgets('ExoBootScreen does not show PNG mark while holding', (tester) async {
    var done = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: productTheme(),
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
      MaterialApp(
        theme: productTheme(),
        home: const Scaffold(
          body: Center(child: ExoCubeSvg(size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeDraw), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });
}
