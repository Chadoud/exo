import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/design/exo_theme.dart';
import 'package:exosites_mobile/features/settings/settings_screen.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('Settings shows signed-in email', (tester) async {
    final storage = MemoryKeyValueStore();
    await storage.write('access_token', 'tok');
    await storage.write('account_email', 'chady@example.com');
    final config = MobileSyncConfig(
      storage: storage,
      localStore: LocalBrainStore(databasePath: ':memory:'),
      httpClient: MockClient(
        (_) async => http.Response('{"email":"chady@example.com"}', 200),
      ),
    );
    await tester.runAsync(config.hydrate);

    await tester.pumpWidget(
      MaterialApp(
        theme: ExoTheme.dark(),
        home: SettingsScreen(config: config),
      ),
    );
    await tester.pump();

    expect(find.text('chady@example.com'), findsOneWidget);
    expect(find.text(SyncUserMessages.settingsAccountSignedIn), findsNothing);
  });
}
