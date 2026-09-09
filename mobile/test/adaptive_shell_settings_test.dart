import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/layout/adaptive_shell.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'support/product_theme.dart';

int _dbSerial = 0;

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.runAsync(() async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
  });
  await tester.pump();
}

Future<MobileSyncConfig> _config(
  WidgetTester tester, {
  bool paired = false,
}) async {
  final storage = MemoryKeyValueStore();
  if (paired) {
    await storage.write('access_token', 'tok');
    await storage.write('sync_paired', '1');
    await storage.write('account_email', 'chady@example.com');
  }
  final config = MobileSyncConfig(
    storage: storage,
    localStore: LocalBrainStore(
      databasePath:
          '${Directory.systemTemp.path}/shell_set_${DateTime.now().microsecondsSinceEpoch}_${++_dbSerial}.db',
    ),
  );
  await tester.runAsync(config.hydrate);
  return config;
}

Future<void> _pumpShell(WidgetTester tester, MobileSyncConfig config) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: productTheme(),
      home: MediaQuery(
        data: const MediaQueryData(size: Size(390, 844)),
        child: AdaptiveShell(config: config),
      ),
    ),
  );
  await _settle(tester);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('unpaired Settings tab lands on Link without AppBar gear', (
    tester,
  ) async {
    final config = await _config(tester);
    await _pumpShell(tester, config);

    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.byIcon(Icons.settings_outlined),
      ),
      findsNothing,
    );

    await tester.tap(find.text(SyncUserMessages.settingsTitle).last);
    await _settle(tester);
    expect(find.text(SyncUserMessages.scanDesktopCode), findsOneWidget);
    await tester.pump(const Duration(seconds: 11));
  });

  testWidgets('paired Settings tab lands on Account without AppBar gear', (
    tester,
  ) async {
    final config = await _config(tester, paired: true);
    await _pumpShell(tester, config);

    await tester.tap(find.text(SyncUserMessages.settingsTitle).last);
    await _settle(tester);
    expect(find.text('chady@example.com'), findsOneWidget);
    expect(find.text(SyncUserMessages.scanDesktopCode), findsNothing);
    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.byIcon(Icons.settings_outlined),
      ),
      findsNothing,
    );
    await tester.pump(const Duration(seconds: 11));
  });
}
