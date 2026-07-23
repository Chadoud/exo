import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Shell/UI smoke is covered manually via `npm run mobile:dev`.
/// Widget pumps that touch plugins/sqflite are flaky in this CI host — keep logic tests here.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('needsOnboarding gates shell until first-sync step completes', () async {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();
    expect(config.needsOnboarding, isTrue);

    await config.saveSession(accessToken: 'tok');
    await config.applyPairingPayload({
      'master_key_b64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    });
    expect(config.isConfigured, isTrue);
    expect(config.needsOnboarding, isTrue);

    await config.completeOnboarding();
    expect(config.needsOnboarding, isFalse);

    await config.clearSession();
    expect(config.needsOnboarding, isTrue);
  });

  test('debug skip pairing enters shell after sign-in without master key', () async {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();
    await config.saveSession(accessToken: 'tok');
    expect(config.isPaired, isFalse);
    expect(config.needsOnboarding, isTrue);

    await config.completeOnboardingSkippingPair();
    expect(config.isPaired, isFalse);
    expect(config.isConfigured, isFalse);
    expect(config.needsOnboarding, isFalse);
  });
}
