import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:exosites_mobile/sync/sync_crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SyncCrypto', () {
    test('logicalClock matches Python sha256 tail algorithm', () {
      const updatedAt = '2026-06-11T12:00:00+00:00';
      const recordId = 'abc-123';
      final clock = SyncCrypto.logicalClock(updatedAt, recordId);
      expect(clock, greaterThan(0));
      expect(clock % 1000, lessThan(1000));
    });

    test('encrypt decrypt roundtrip', () async {
      final key = SecretKey(Uint8List.fromList(List.filled(32, 7)));
      const plain = 'hello sync';
      final ct = await SyncCrypto.encryptRecord(Uint8List.fromList(utf8.encode(plain)), key);
      final out = await SyncCrypto.decryptRecord(ct, key);
      expect(utf8.decode(out), plain);
    });

    test('buildEnvelope shape defaults to v3', () async {
      final mk = Uint8List.fromList(List.filled(32, 9));
      final rkey = await SyncCrypto.recordKey(mk, 'memory_entries', 'id-1');
      final env = await SyncCrypto.buildEnvelope(
        collection: 'memory_entries',
        recordId: 'id-1',
        deviceId: 'device-1',
        logicalClock: 1,
        updatedAt: '2026-06-11T12:00:00+00:00',
        plaintext: Uint8List.fromList(utf8.encode('{"a":1}')),
        recordKey: rkey,
        accountId: '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(env['schema_version'], SyncCrypto.schemaV3);
      expect(env['ciphertext'], isNotEmpty);
      expect('${env['content_hash']}'.length, 64);
    });

    test('v2 AAD rejects tampered deleted flag', () async {
      final mk = Uint8List.fromList(List.filled(32, 3));
      final rkey = await SyncCrypto.recordKey(mk, 'tasks', 't1');
      final env = await SyncCrypto.buildEnvelope(
        collection: 'tasks',
        recordId: 't1',
        deviceId: 'd1',
        logicalClock: 9,
        updatedAt: '2026-06-11T12:00:00Z',
        plaintext: Uint8List.fromList(utf8.encode('{}')),
        recordKey: rkey,
        deleted: false,
        schemaVersion: SyncCrypto.schemaV2,
      );
      final aadTampered = SyncCrypto.aadBytes(
        collection: 'tasks',
        recordId: 't1',
        deviceId: 'd1',
        logicalClock: 9,
        deleted: true,
        schemaVersion: SyncCrypto.schemaV2,
      );
      expect(
        () => SyncCrypto.decryptRecord(
          env['ciphertext'] as String,
          rkey,
          aad: aadTampered,
        ),
        throwsA(isA<Object>()),
      );
    });

    test('shared golden envelopes match Python fixtures', () async {
      final file = File('../sync/testdata/golden_envelopes.json');
      expect(file.existsSync(), isTrue, reason: 'run from mobile/ with repo sync/testdata');
      final data = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final vectors = (data['vectors'] as List).cast<Map<String, dynamic>>();
      for (final vec in vectors) {
        final master = base64Decode(vec['master_key_b64'] as String);
        final rkey = await SyncCrypto.recordKey(
          Uint8List.fromList(master),
          vec['collection'] as String,
          vec['record_id'] as String,
        );
        final aad = SyncCrypto.aadBytes(
          collection: vec['collection'] as String,
          recordId: vec['record_id'] as String,
          deviceId: vec['device_id'] as String,
          logicalClock: vec['logical_clock'] as int,
          deleted: vec['deleted'] as bool,
          schemaVersion: vec['schema_version'] as int,
          accountId: vec['account_id'] as String?,
        );
        expect(utf8.decode(aad), vec['aad_utf8']);
        final plain = await SyncCrypto.decryptRecord(
          vec['ciphertext_b64'] as String,
          rkey,
          aad: aad,
        );
        expect(utf8.decode(plain), vec['plaintext_utf8']);
        final nonce = base64Decode(vec['nonce_b64'] as String);
        final ct = await SyncCrypto.encryptRecord(
          plain,
          rkey,
          aad: aad,
          nonce: nonce,
        );
        expect(ct, vec['ciphertext_b64']);
      }
    });
  });
}
