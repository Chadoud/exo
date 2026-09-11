import 'package:exosites_mobile/features/setup/setup_copy.dart';
import 'package:exosites_mobile/features/setup/setup_profile_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/product_theme.dart';

Widget _app(Widget child) {
  return MaterialApp(
    locale: const Locale('en'),
    theme: productTheme(),
    home: Scaffold(body: SingleChildScrollView(child: child)),
  );
}

void main() {
  testWidgets('Continue stays off until a first name and one work chip', (
    tester,
  ) async {
    final copy = SetupCopy(const Locale('en'));
    var first = '';
    var role = null as String?;
    var continued = 0;

    await tester.pumpWidget(
      _app(
        SetupProfilePanel(
          copy: copy,
          showNameFields: true,
          firstName: first,
          lastName: '',
          workRole: role,
          busy: false,
          onFirstName: (v) => first = v,
          onLastName: (_) {},
          onWorkRole: (v) => role = v,
          onContinue: () => continued++,
          onSignOut: () {},
        ),
      ),
    );

    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);

    await tester.enterText(find.byType(TextField).first, 'Ada');
    await tester.pump();
    await tester.pumpWidget(
      _app(
        SetupProfilePanel(
          copy: copy,
          showNameFields: true,
          firstName: 'Ada',
          lastName: '',
          workRole: null,
          busy: false,
          onFirstName: (_) {},
          onLastName: (_) {},
          onWorkRole: (_) {},
          onContinue: () => continued++,
          onSignOut: () {},
        ),
      ),
    );
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);

    await tester.pumpWidget(
      _app(
        SetupProfilePanel(
          copy: copy,
          showNameFields: true,
          firstName: 'Ada',
          lastName: '',
          workRole: 'founder',
          busy: false,
          onFirstName: (_) {},
          onLastName: (_) {},
          onWorkRole: (_) {},
          onContinue: () => continued++,
          onSignOut: () {},
        ),
      ),
    );
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
    await tester.tap(find.text(copy.profileContinue));
    expect(continued, 1);
  });

  testWidgets('hides name fields when the account already has a name', (tester) async {
    final copy = SetupCopy(const Locale('en'));
    await tester.pumpWidget(
      _app(
        SetupProfilePanel(
          copy: copy,
          showNameFields: false,
          firstName: '',
          lastName: '',
          workRole: null,
          busy: false,
          onFirstName: (_) {},
          onLastName: (_) {},
          onWorkRole: (_) {},
          onContinue: () {},
          onSignOut: () {},
        ),
      ),
    );
    expect(find.byType(TextField), findsNothing);
    expect(find.text(copy.workRoleLabel('investing')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
  });
}
