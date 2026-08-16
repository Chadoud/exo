import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/sync_engine.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late MemoryKeyValueStore storage;
  late LocalBrainStore store;
  late MobileSyncConfig config;

  setUp(() async {
    storage = MemoryKeyValueStore();
    store = LocalBrainStore(databasePath: ':memory:');
    config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();
  });

  test('saveSession and hydrate restore access token', () async {
    await config.saveSession(accessToken: 'tok', refreshToken: 'ref');
    final again = MobileSyncConfig(storage: storage, localStore: store);
    await again.hydrate();
    expect(again.isSignedIn, isTrue);
    expect(again.accessTokenSync, 'tok');
    expect(storage.contains('refresh_token'), isTrue);
  });

  test('applyPairingPayload sets paired and master key', () async {
    await config.applyPairingPayload({
      'v': 1,
      'master_key_b64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
      'cloud_url': 'https://staging-api.exosites.ch',
    });
    expect(config.isPaired, isTrue);
    expect(config.cloudUrlSync, 'https://staging-api.exosites.ch');
    expect(storage.contains('exosites_sync_master_key_b64'), isTrue);
  });

  test('applyPairingPayload clears cursor, ever-synced, and local cache', () async {
    await storage.write(SyncEngine.cursorStorageKey, '99');
    await storage.write('has_ever_synced', '1');
    await storage.write('last_sync_label', 'earlier');
    await store.upsertRecord(
      collection: 'memory_entries',
      recordId: 'old',
      payloadJson: '{"key":"x"}',
      updatedAt: '2026-01-01T00:00:00Z',
    );
    expect(await store.countAll(), 1);

    await config.applyPairingPayload({
      'v': 1,
      'master_key_b64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    });

    expect(config.isPaired, isTrue);
    expect(config.hasEverSynced, isFalse);
    expect(storage.contains(SyncEngine.cursorStorageKey), isFalse);
    expect(storage.contains('has_ever_synced'), isFalse);
    expect(storage.contains('last_sync_label'), isFalse);
    expect(await store.countAll(), 0);
  });

  test('hydrate migrates oversized legacy device id', () async {
    await storage.write('device_id', 'mobile-${'a' * 36}');
    final again = MobileSyncConfig(storage: storage, localStore: store);
    await again.hydrate();
    final id = await storage.read('device_id');
    expect(id, isNotNull);
    expect(id!.length, lessThanOrEqualTo(36));
    expect(id.startsWith('mobile-'), isFalse);
  });

  test('clearPairing keeps sign-in and drops master key', () async {
    await config.saveSession(accessToken: 'tok', refreshToken: 'ref');
    await config.applyPairingPayload({
      'master_key_b64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    });
    await config.clearPairing();
    expect(config.isSignedIn, isTrue);
    expect(config.isPaired, isFalse);
    expect(storage.contains('exosites_sync_master_key_b64'), isFalse);
  });

  test('hydrate restores cached account email', () async {
    await storage.write('access_token', 'tok');
    await storage.write('account_email', 'chady@example.com');
    final again = MobileSyncConfig(storage: storage, localStore: store);
    await again.hydrate();
    expect(again.accountEmail, 'chady@example.com');
  });

  test('clearSession wipes tokens, pairing, cursor, and local cache', () async {
    await config.saveSession(accessToken: 'tok', refreshToken: 'ref');
    await config.applyPairingPayload({
      'master_key_b64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    });
    await storage.write(SyncEngine.cursorStorageKey, '42');
    await store.upsertRecord(
      collection: 'memory_entries',
      recordId: 'r1',
      payloadJson: '{"key":"a"}',
      updatedAt: '2026-01-01T00:00:00Z',
    );
    expect(await store.countAll(), 1);

    await config.clearSession();

    expect(config.isSignedIn, isFalse);
    expect(config.isPaired, isFalse);
    expect(config.isConfigured, isFalse);
    expect(storage.contains('access_token'), isFalse);
    expect(storage.contains('refresh_token'), isFalse);
    expect(storage.contains('exosites_sync_master_key_b64'), isFalse);
    expect(storage.contains(SyncEngine.cursorStorageKey), isFalse);
    expect(await store.countAll(), 0);
  });
}
