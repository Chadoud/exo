import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';

/// GO SYNC crypto — ChaCha20-Poly1305 (matches Python `exosites_crypto`).
class SyncCrypto {
  static const int keyLength = 32;
  static const int nonceLength = 12;
  static const int schemaV1 = 1;
  static const int schemaV2 = 2;
  static const int schemaV3 = 3;
  /// Highest schema this client can decrypt.
  static const int maxSupportedSchema = schemaV3;

  static final _chacha = Chacha20.poly1305Aead();
  static final _rng = Random.secure();

  /// Stable 32-byte key per (collection, record_id) derived from master key.
  static Future<SecretKey> recordKey(Uint8List masterKey, String collection, String recordId) async {
    final h = await Sha256().hash(
      Uint8List.fromList([...masterKey, ...utf8.encode(collection), ...utf8.encode(recordId)]),
    );
    return SecretKey(h.bytes);
  }

  /// Canonical AAD for schema v2+ (must match Python `aad_bytes`).
  static List<int> aadBytes({
    required String collection,
    required String recordId,
    required String deviceId,
    required int logicalClock,
    required bool deleted,
    required int schemaVersion,
    String? accountId,
  }) {
    final deletedFlag = deleted ? '1' : '0';
    if (schemaVersion >= schemaV3) {
      if (accountId == null || accountId.isEmpty) {
        throw ArgumentError('account_id required for schema v3 AAD');
      }
      return utf8.encode(
        'exo-sync-aad-v1|$accountId|$collection|$recordId|$deviceId|$logicalClock|$deletedFlag|$schemaVersion',
      );
    }
    return utf8.encode(
      'exo-sync-aad-v1|$collection|$recordId|$deviceId|$logicalClock|$deletedFlag|$schemaVersion',
    );
  }

  static Future<String> encryptRecord(
    Uint8List plaintext,
    SecretKey recordKey, {
    List<int>? aad,
    List<int>? nonce,
  }) async {
    final n = nonce ?? _randomNonce();
    if (n.length != nonceLength) {
      throw ArgumentError('nonce must be $nonceLength bytes');
    }
    final box = aad == null
        ? await _chacha.encrypt(plaintext, secretKey: recordKey, nonce: n)
        : await _chacha.encrypt(
            plaintext,
            secretKey: recordKey,
            nonce: n,
            aad: aad,
          );
    final combined = Uint8List.fromList([...n, ...box.cipherText, ...box.mac.bytes]);
    return base64Encode(combined);
  }

  static Future<Uint8List> decryptRecord(
    String ciphertextB64,
    SecretKey recordKey, {
    List<int>? aad,
  }) async {
    final raw = base64Decode(ciphertextB64);
    if (raw.length < nonceLength + 16) {
      throw ArgumentError('ciphertext too short');
    }
    final n = raw.sublist(0, nonceLength);
    final rest = raw.sublist(nonceLength);
    const macLen = 16;
    final cipherText = rest.sublist(0, rest.length - macLen);
    final mac = Mac(rest.sublist(rest.length - macLen));
    final box = SecretBox(cipherText, nonce: n, mac: mac);
    final plain = aad == null
        ? await _chacha.decrypt(box, secretKey: recordKey)
        : await _chacha.decrypt(box, secretKey: recordKey, aad: aad);
    return Uint8List.fromList(plain);
  }

  static String contentHash(Uint8List plaintext) {
    final digest = sha256.convert(plaintext);
    return digest.bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  /// Matches Python `backend/sync_engine.py` logical clock (seconds × 1000 + tail).
  static int logicalClock(String updatedAt, String recordId) {
    final dt = DateTime.tryParse(updatedAt);
    final baseSec = dt != null ? dt.millisecondsSinceEpoch ~/ 1000 : 0;
    final hex = sha256.convert(utf8.encode(recordId)).toString();
    final tail = int.parse(hex.substring(0, 8), radix: 16) % 1000;
    return baseSec * 1000 + tail;
  }

  static Future<Map<String, dynamic>> buildEnvelope({
    required String collection,
    required String recordId,
    required String deviceId,
    required int logicalClock,
    required String updatedAt,
    required Uint8List plaintext,
    required SecretKey recordKey,
    bool deleted = false,
    int schemaVersion = schemaV3,
    String? accountId,
    List<int>? nonce,
  }) async {
    List<int>? aad;
    if (schemaVersion >= schemaV2) {
      aad = aadBytes(
        collection: collection,
        recordId: recordId,
        deviceId: deviceId,
        logicalClock: logicalClock,
        deleted: deleted,
        schemaVersion: schemaVersion,
        accountId: accountId,
      );
    }
    return {
      'schema_version': schemaVersion,
      'collection': collection,
      'record_id': recordId,
      'device_id': deviceId,
      'logical_clock': logicalClock,
      'updated_at': updatedAt,
      'deleted': deleted,
      'ciphertext': await encryptRecord(plaintext, recordKey, aad: aad, nonce: nonce),
      'content_hash': contentHash(plaintext),
    };
  }

  static List<int> _randomNonce() {
    return List<int>.generate(nonceLength, (_) => _rng.nextInt(256));
  }
}
