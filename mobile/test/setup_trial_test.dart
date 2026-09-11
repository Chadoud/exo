import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/billing/store_billing.dart';
import 'package:exosites_mobile/features/setup/setup_copy.dart';
import 'package:exosites_mobile/features/setup/setup_me.dart';
import 'package:exosites_mobile/features/setup/setup_trial_panel.dart';
import 'package:exosites_mobile/features/setup/setup_trial_step.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'support/product_theme.dart';

int _dbSerial = 0;

String _tempDb() =>
    '${Directory.systemTemp.path}/trial_${DateTime.now().microsecondsSinceEpoch}_${++_dbSerial}.db';

Widget _app(Widget child) {
  return MaterialApp(
    locale: const Locale('en'),
    supportedLocales: const [Locale('en')],
    localizationsDelegates: const [
      DefaultMaterialLocalizations.delegate,
      DefaultWidgetsLocalizations.delegate,
    ],
    theme: productTheme(),
    home: Scaffold(
      body: SingleChildScrollView(child: child),
    ),
  );
}

Future<MobileSyncConfig> _config(
  WidgetTester tester,
  MockClient client,
) async {
  late final MobileSyncConfig config;
  await tester.runAsync(() async {
    final storage = MemoryKeyValueStore();
    config = MobileSyncConfig(
      storage: storage,
      localStore: LocalBrainStore(databasePath: _tempDb()),
      httpClient: client,
    );
    await config.hydrate();
    await config.saveSession(accessToken: 'tok');
  });
  return config;
}

Future<void> _flushStore(WidgetTester tester) async {
  await tester.pump();
  await tester.runAsync(() async {
    await Future<void>.delayed(Duration.zero);
  });
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('trial panel shows the store price and disables Start without one', (
    tester,
  ) async {
    final copy = SetupCopy(const Locale('en'));
    await tester.pumpWidget(
      _app(
        SetupTrialPanel(
          copy: copy,
          storePrice: 'CHF 20.00',
          busy: false,
          onStart: () {},
          onRestore: () {},
          onSignOut: () {},
        ),
      ),
    );
    expect(find.text(copy.trialTitle), findsOneWidget);
    expect(find.textContaining('CHF 20.00'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);

    await tester.pumpWidget(
      _app(
        SetupTrialPanel(
          copy: copy,
          storePrice: null,
          busy: false,
          startEnabled: false,
          onStart: () {},
          onRestore: () {},
          onSignOut: () {},
        ),
      ),
    );
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
  });

  testWidgets('compact trial panel hides onboarding chrome', (tester) async {
    final copy = SetupCopy(const Locale('en'));
    await tester.pumpWidget(
      _app(
        SetupTrialPanel(
          copy: copy,
          storePrice: 'CHF 20.00',
          busy: false,
          compact: true,
          onStart: () {},
          onRestore: () {},
        ),
      ),
    );
    expect(find.text(copy.trialTitle), findsNothing);
    expect(find.text(copy.inboxEmptyHint), findsNothing);
    expect(find.text(copy.signOut), findsNothing);
    expect(find.textContaining('CHF 20.00'), findsOneWidget);
    expect(find.text(copy.startTrial), findsOneWidget);
  });

  testWidgets('leaves trial only after verify and /me flips required false', (
    tester,
  ) async {
    var required = true;
    String? verifyBody;
    final config = await _config(
      tester,
      MockClient((req) async {
        if (req.url.path.endsWith('/v1/billing/store/verify')) {
          verifyBody = req.body;
          required = false;
          return http.Response('{"ok":true}', 200);
        }
        if (req.url.path.endsWith('/v1/me')) {
          return http.Response(
            jsonEncode({'store_checkout_required': required}),
            200,
          );
        }
        return http.Response('missing', 404);
      }),
    );
    final store = FakeStoreBilling();
    addTearDown(store.dispose);
    SetupMeSnapshot? verified;
    await tester.pumpWidget(
      _app(
        SetupTrialStep(
          config: config,
          storeBilling: store,
          onVerified: (me) => verified = me,
          onSignOut: () async {},
        ),
      ),
    );
    await _flushStore(tester);

    expect(find.textContaining('CHF 20.00'), findsOneWidget);
    await tester.tap(find.text(SetupCopy(const Locale('en')).startTrial));
    await _flushStore(tester);
    await _flushStore(tester);

    expect(verified, isNotNull);
    expect(verified!.storeCheckoutRequired, isFalse);
    final body = jsonDecode(verifyBody!) as Map<String, dynamic>;
    expect(body['platform'], 'play');
    expect(body['signed_jws'], 'e30.e30.sig');
    expect(body.containsKey('purchase_token'), isFalse);
  });

  testWidgets('stays on trial when /me still requires checkout', (tester) async {
    final config = await _config(
      tester,
      MockClient((req) async {
        if (req.url.path.endsWith('/v1/billing/store/verify')) {
          return http.Response('{"ok":true}', 200);
        }
        if (req.url.path.endsWith('/v1/me')) {
          return http.Response('{"store_checkout_required":true}', 200);
        }
        return http.Response('missing', 404);
      }),
    );
    final store = FakeStoreBilling();
    addTearDown(store.dispose);
    var left = false;
    await tester.pumpWidget(
      _app(
        SetupTrialStep(
          config: config,
          storeBilling: store,
          onVerified: (_) => left = true,
          onSignOut: () async {},
        ),
      ),
    );
    await _flushStore(tester);
    await tester.tap(find.text(SetupCopy(const Locale('en')).startTrial));
    await _flushStore(tester);
    await _flushStore(tester);

    expect(left, isFalse);
    expect(
      find.text(SetupCopy(const Locale('en')).verifyFailed),
      findsOneWidget,
    );
  });

  testWidgets('restore with no store event shows empty copy', (tester) async {
    final config = await _config(
      tester,
      MockClient((_) async => http.Response('{"store_checkout_required":true}', 200)),
    );
    final store = FakeStoreBilling();
    addTearDown(store.dispose);
    await tester.pumpWidget(
      _app(
        SetupTrialStep(
          config: config,
          storeBilling: store,
          onVerified: (_) {},
          onSignOut: () async {},
        ),
      ),
    );
    await _flushStore(tester);
    await tester.tap(find.text(SetupCopy(const Locale('en')).restorePurchases));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    expect(
      find.text(SetupCopy(const Locale('en')).restoreEmpty),
      findsOneWidget,
    );
  });
}
