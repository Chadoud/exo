import 'package:exosites_mobile/calendars/apple_calendar.dart';
import 'package:exosites_mobile/features/setup/setup_copy.dart';
import 'package:exosites_mobile/features/setup/setup_sources_ack.dart';
import 'package:exosites_mobile/features/setup/setup_sources_panel.dart';
import 'package:exosites_mobile/features/setup/setup_sources_step.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
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
  final copy = SetupCopy(const Locale('en'));

  test('SetupSourcesAck persists outside MobileSyncConfig', () async {
    final store = MemoryKeyValueStore();
    final ack = SetupSourcesAck(store: store);
    await ack.hydrate();
    expect(ack.acknowledged, isFalse);
    await ack.mark();
    expect(store.contains(SetupSourcesAck.storageKey), isTrue);
    final again = SetupSourcesAck(store: store);
    await again.hydrate();
    expect(again.acknowledged, isTrue);
  });

  testWidgets('Google and Outlook are computer-only; Continue skips', (tester) async {
    var continued = 0;
    await tester.pumpWidget(
      _app(
        SetupSourcesPanel(
          copy: copy,
          appleSupported: false,
          apple: const AppleCalendarSnapshot(status: AppleCalendarStatus.unavailable),
          appleBusy: false,
          onUseApple: () {},
          onOpenSettings: () {},
          onContinue: () => continued++,
          onSignOut: () {},
        ),
      ),
    );
    expect(find.text(copy.sourcesGoogle), findsOneWidget);
    expect(find.text(copy.sourcesOutlook), findsOneWidget);
    expect(find.text(copy.sourcesAppleUnavailable), findsOneWidget);
    expect(find.text(copy.sourcesAppleAction), findsNothing);
    await tester.tap(find.text(copy.sourcesContinue));
    expect(continued, 1);
  });

  testWidgets('iOS Use calendars does not run until tapped', (tester) async {
    var requests = 0;
    final apple = FakeAppleCalendar(
      onRequest: () {
        requests++;
        return const AppleCalendarSnapshot(
          status: AppleCalendarStatus.authorized,
          calendarCount: 2,
        );
      },
    );
    var acked = false;
    await tester.pumpWidget(
      _app(
        SetupSourcesStep(
          ack: SetupSourcesAck(store: MemoryKeyValueStore()),
          appleCalendar: apple,
          appleSupported: true,
          onAcknowledged: () => acked = true,
          onSignOut: () async {},
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(requests, 0);
    expect(find.text(copy.sourcesAppleAction), findsOneWidget);
    await tester.tap(find.text(copy.sourcesAppleAction));
    await tester.pump();
    await tester.pump();
    expect(requests, 1);
    expect(find.text(copy.sourcesAppleReady), findsOneWidget);
    await tester.tap(find.text(copy.sourcesContinue));
    await tester.pump();
    expect(acked, isTrue);
  });

  testWidgets('denied Apple access offers Settings, not a second prompt', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        SetupSourcesPanel(
          copy: copy,
          appleSupported: true,
          apple: const AppleCalendarSnapshot(status: AppleCalendarStatus.denied),
          appleBusy: false,
          onUseApple: () {},
          onOpenSettings: () {},
          onContinue: () {},
          onSignOut: () {},
        ),
      ),
    );
    expect(find.text(copy.sourcesAppleDenied), findsOneWidget);
    expect(find.text(copy.sourcesOpenSettings), findsOneWidget);
    expect(find.text(copy.sourcesAppleAction), findsNothing);
  });
}
