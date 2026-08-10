import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/sync_errors.dart';
import 'package:exosites_mobile/sync/sync_list_empty.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('classifySyncListEmpty uses hasEverSynced not label alone', () async {
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: LocalBrainStore(databasePath: ':memory:'),
    );
    await config.hydrate();
    expect(classifySyncListEmpty(config), SyncListEmptyKind.unpaired);

    await config.storage.write('sync_paired', '1');
    await config.hydrate();
    expect(config.isPaired, isTrue);
    expect(config.hasEverSynced, isFalse);
    expect(classifySyncListEmpty(config), SyncListEmptyKind.neverPulled);

    await config.storage.write('has_ever_synced', '1');
    await config.storage.write('last_sync_label', '2026-07-24 12:00:00');
    await config.hydrate();
    expect(config.hasEverSynced, isTrue);
    expect(classifySyncListEmpty(config), SyncListEmptyKind.syncedEmpty);
  });

  test('failed syncNow sets lastError and does not set hasEverSynced', () async {
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: LocalBrainStore(databasePath: ':memory:'),
    );
    await config.hydrate();
    await config.saveSession(accessToken: 'tok');
    // Paired flag without a real cloud pull — syncNow will fail at network/engine.
    await config.storage.write('sync_paired', '1');
    await config.hydrate();
    await config.saveSession(accessToken: 'tok');

    expect(config.hasEverSynced, isFalse);
    try {
      await config.syncNow();
      fail('expected syncNow to throw');
    } catch (_) {}
    expect(config.hasEverSynced, isFalse);
    expect(config.lastError, isNotNull);
    expect(config.lastError!.message, isNotEmpty);
    // Auth/network/generic — any mapped failure is fine.
    expect(
      [
        SyncUserMessages.networkFailed,
        SyncUserMessages.syncFailed,
        SyncUserMessages.authExpired,
        SyncUserMessages.decryptFailed,
        SyncUserMessages.notPaired,
      ],
      contains(config.lastError!.message),
    );
  });

  test('SyncNotPairedException maps via describe path when unpaired', () async {
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: LocalBrainStore(databasePath: ':memory:'),
    );
    await config.hydrate();
    await config.saveSession(accessToken: 'tok');
    expect(config.isPaired, isFalse);
    try {
      await config.syncNow();
      fail('expected not paired');
    } on SyncNotPairedException {
      // expected
    }
    expect(config.lastError?.message, SyncUserMessages.notPaired);
    expect(config.hasEverSynced, isFalse);
  });
}
