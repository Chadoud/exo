import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/pairing_payload.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  const validV2Json =
      '{"v":2,"cloud_url":"https://api.exosites.ch","master_key_b64":"YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=","account_id":"550e8400-e29b-41d4-a716-446655440000","grant_token":"tok","issued_at":"2099-01-01T00:00:00Z"}';

  group('tryParsePairingPayload', () {
    test('accepts valid v2 payload', () {
      final result = tryParsePairingPayload(validV2Json);
      expect(result, isA<PairingParseOk>());
      final ok = result as PairingParseOk;
      expect(ok.payload['v'], 2);
      expect(ok.payload['grant_token'], 'tok');
    });

    test('rejects empty', () {
      final result = tryParsePairingPayload('   ');
      expect(result, isA<PairingParseFail>());
      expect((result as PairingParseFail).reason, PairingParseFailure.empty);
    });

    test('rejects garbage JSON', () {
      final result = tryParsePairingPayload('not-json');
      expect(
        (result as PairingParseFail).reason,
        PairingParseFailure.invalidJson,
      );
    });

    test('rejects truncated paste mid master_key (Simulator clipboard)', () {
      final result = tryParsePairingPayload(
        '4=","account_id":"ae119b1e-b432-4f8c-bb0b-b49978a18c03","grant_token":"tok"}',
      );
      expect(
        (result as PairingParseFail).reason,
        PairingParseFailure.invalidJson,
      );
      expect(
        messageForPairingParseFailure(PairingParseFailure.invalidJson),
        contains(r'{"v":2'),
      );
    });

    test('rejects v1 without grant (sunset)', () {
      final result = tryParsePairingPayload(
        '{"v":1,"master_key_b64":"YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY="}',
      );
      expect(
        (result as PairingParseFail).reason,
        PairingParseFailure.unsupportedVersion,
      );
    });

    test('v2 requires grant_token and account_id', () {
      final result = tryParsePairingPayload(
        '{"v":2,"master_key_b64":"YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY="}',
      );
      expect(
        (result as PairingParseFail).reason,
        PairingParseFailure.missingGrant,
      );
    });

    test('rejects missing master key', () {
      final result = tryParsePairingPayload(
        '{"v":2,"cloud_url":"https://api.exosites.ch","account_id":"x","grant_token":"t"}',
      );
      expect(
        (result as PairingParseFail).reason,
        PairingParseFailure.missingMasterKey,
      );
    });

    test('rejects non-allowlisted cloud_url', () {
      final result = tryParsePairingPayload(
        '{"v":2,"cloud_url":"https://evil.example","master_key_b64":"YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=","account_id":"550e8400-e29b-41d4-a716-446655440000","grant_token":"tok"}',
      );
      expect(
        (result as PairingParseFail).reason,
        PairingParseFailure.disallowedCloudUrl,
      );
    });
  });

  test('accountIdFromAccessToken reads JWT sub', () {
    // {"sub":"550e8400-e29b-41d4-a716-446655440000"}
    const token =
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAifQ.';
    expect(
      accountIdFromAccessToken(token),
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  test('masterKeyFingerprintB64 is sha256 hex of raw key', () {
    final fp = masterKeyFingerprintB64('YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=');
    expect(fp.length, 64);
    expect(RegExp(r'^[a-f0-9]{64}$').hasMatch(fp), isTrue);
  });

  test('messageForPairingParseFailure is distinct per reason', () {
    expect(
      messageForPairingParseFailure(PairingParseFailure.invalidJson),
      isNot(SyncUserMessages.invalidPairingQr),
    );
    expect(
      messageForPairingParseFailure(PairingParseFailure.expired),
      isNot(messageForPairingParseFailure(PairingParseFailure.accountMismatch)),
    );
  });

  test('applyPairingRaw returns failure for garbage', () async {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();

    final fail = await applyPairingRaw(config, 'nope');
    expect(fail, PairingParseFailure.invalidJson);
    expect(config.isPaired, isFalse);
  });
}
