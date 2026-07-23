import 'package:exosites_mobile/design/exo_cube_svg.dart';
import 'package:exosites_mobile/design/exo_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('ExoCubeSvg loads the asset SVG', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoCubeSvg(size: 48)),
        ),
      ),
    );
    expect(find.byType(ExoCubeSvg), findsOneWidget);
    expect(find.byType(SvgPicture), findsOneWidget);
  });

  testWidgets('ExoMark uses SVG cube not CustomPaint', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(child: ExoMark()),
        ),
      ),
    );
    expect(find.byType(ExoCubeSvg), findsOneWidget);
    expect(find.text('EXO'), findsOneWidget);
  });
}
