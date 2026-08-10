import 'package:exosites_mobile/design/exo_cube_draw.dart';
import 'package:exosites_mobile/design/exo_cube_svg.dart';
import 'package:exosites_mobile/design/exo_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('ExoCubeSvg is the stroke mark (not a PNG)', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoCubeSvg(size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeSvg), findsOneWidget);
    expect(find.byType(ExoCubeDraw), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('ExoMark uses brand stroke cube', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoMark()),
        ),
      ),
    );
    expect(find.byType(ExoCubeDraw), findsOneWidget);
    expect(find.text('EXO'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });
}
