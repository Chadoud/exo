import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'support/product_theme.dart';
import 'package:exosites_mobile/features/app/app_sub_tab.dart';
import 'package:exosites_mobile/features/app/settings_copy.dart';
import 'package:exosites_mobile/features/settings/settings_screen.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

int _dbSerial = 0;

String _tempDb() =>
    '${Directory.systemTemp.path}/settings_ui_${DateTime.now().microsecondsSinceEpoch}_${++_dbSerial}.db';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('Settings chips start on Account and split Reminders from Sources', (
    tester,
  ) async {
    final storage = MemoryKeyValueStore();
    await storage.write('access_token', 'tok');
    await storage.write('account_email', 'chady@example.com');
    final config = MobileSyncConfig(
      storage: storage,
      localStore: LocalBrainStore(databasePath: _tempDb()),
      httpClient: MockClient(
        (_) async => http.Response('{"email":"chady@example.com"}', 200),
      ),
    );
    await tester.runAsync(config.hydrate);

    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        supportedLocales: const [Locale('en')],
        localizationsDelegates: const [
          DefaultMaterialLocalizations.delegate,
          DefaultWidgetsLocalizations.delegate,
        ],
        theme: productTheme(),
        home: SettingsScreen(config: config, initialSubTab: AppSubTab.account),
      ),
    );
    await tester.pump();

    expect(find.text('Link'), findsOneWidget);
    expect(find.text('Account'), findsWidgets);
    expect(find.text('Reminders'), findsOneWidget);
    expect(find.text('Sources'), findsOneWidget);
    expect(find.text('Privacy'), findsOneWidget);
    expect(
      tester
          .widgetList<ChoiceChip>(find.byType(ChoiceChip))
          .map((chip) => (chip.label as Text).data)
          .toList(),
      ['Account', 'Link', 'Reminders', 'Sources', 'Privacy'],
    );
    expect(find.text('chady@example.com'), findsOneWidget);
    expect(find.text(SyncUserMessages.settingsAccountSignedIn), findsNothing);
    expect(find.text('Remind me when due'), findsNothing);

    await tester.tap(find.text('Reminders'));
    await tester.pump();
    expect(find.text('Remind me when due'), findsOneWidget);
    expect(find.text('Show the task name'), findsOneWidget);
    expect(find.text('Turn on reminders first.'), findsOneWidget);
    expect(find.text('chady@example.com'), findsNothing);
    expect(find.textContaining('Connect Gmail'), findsNothing);

    await tester.tap(find.text('Sources'));
    await tester.pump();
    expect(find.text('EXTERNAL ACCOUNTS'), findsOneWidget);
    expect(find.textContaining('Connect Gmail'), findsOneWidget);
    expect(find.text('Remind me when due'), findsNothing);
    expect(find.text('Mail & calendars'), findsNothing);
  });

  testWidgets('Privacy has no capture teaser; paired Link says Scan a new code', (
    tester,
  ) async {
    final storage = MemoryKeyValueStore();
    await storage.write('access_token', 'tok');
    await storage.write('sync_paired', '1');
    await storage.write('account_email', 'chady@example.com');
    final config = MobileSyncConfig(
      storage: storage,
      localStore: LocalBrainStore(databasePath: _tempDb()),
      httpClient: MockClient(
        (_) async => http.Response('{"email":"chady@example.com"}', 200),
      ),
    );
    await tester.runAsync(config.hydrate);

    await tester.pumpWidget(
      MaterialApp(
        theme: productTheme(),
        home: SettingsScreen(config: config, initialSubTab: AppSubTab.privacy),
      ),
    );
    await tester.pump();

    expect(find.text('Send crash reports'), findsOneWidget);
    expect(find.text('Privacy policy'), findsOneWidget);
    expect(find.textContaining('Voice capture'), findsNothing);
    expect(find.textContaining('coming in a later'), findsNothing);

    await tester.tap(find.text('Link'));
    await tester.pump();
    expect(find.text(SyncUserMessages.scanNewCode), findsOneWidget);
    expect(find.text('Re-pair device'), findsNothing);
  });

  testWidgets('sign-out dialog talks about this phone, not memories', (
    tester,
  ) async {
    final storage = MemoryKeyValueStore();
    await storage.write('access_token', 'tok');
    await storage.write('sync_paired', '1');
    await storage.write('account_email', 'chady@example.com');
    final config = MobileSyncConfig(
      storage: storage,
      localStore: LocalBrainStore(databasePath: _tempDb()),
    );
    await tester.runAsync(config.hydrate);

    await tester.pumpWidget(
      MaterialApp(
        theme: productTheme(),
        home: SettingsScreen(config: config, initialSubTab: AppSubTab.account),
      ),
    );
    await tester.pump();

    final copy = SettingsCopy(const Locale('en'));
    await tester.tap(find.text(copy.signOut));
    await tester.pump();
    expect(find.text(copy.signOutTitle), findsOneWidget);
    expect(find.text(copy.signOutBody), findsOneWidget);
    expect(find.textContaining('memories'), findsNothing);
  });

  test('Settings chips are French', () {
    final copy = SettingsCopy(const Locale('fr'));
    expect(
      AppSubTab.values.map(copy.chip).toList(),
      ['Compte', 'Lien', 'Rappels', 'Comptes', 'Confidentialité'],
    );
  });
}
