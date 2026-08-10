import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../app/mobile_sync_config.dart';
import 'cloud_api.dart';
import 'pairing_cloud_url.dart';
import 'user_messages.dart';

export 'pairing_cloud_url.dart' show isAllowedPairingCloudUrl;

/// Unverified JWT `sub` for client-side preflight (server still enforces).
String? accountIdFromAccessToken(String token) {
  final parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (payload.length % 4 != 0) {
      payload += '=';
    }
    final map = jsonDecode(utf8.decode(base64Decode(payload)));
    if (map is! Map) return null;
    final sub = map['sub'];
    return sub is String && sub.isNotEmpty ? sub : null;
  } catch (_) {
    return null;
  }
}

String masterKeyFingerprintB64(String masterKeyB64) {
  final bytes = base64Decode(masterKeyB64);
  return sha256.convert(bytes).toString();
}

/// Why [tryParsePairingPayload] rejected input.
enum PairingParseFailure {
  empty,
  invalidJson,
  unsupportedVersion,
  missingMasterKey,
  badMasterKeyLength,
  disallowedCloudUrl,
  missingGrant,
  expired,
  accountMismatch,
}

/// Result of parsing desktop pairing JSON (QR / clipboard).
sealed class PairingParseResult {
  const PairingParseResult();
}

final class PairingParseOk extends PairingParseResult {
  const PairingParseOk(this.payload);

  final Map<String, dynamic> payload;
}

final class PairingParseFail extends PairingParseResult {
  const PairingParseFail(this.reason);

  final PairingParseFailure reason;
}

/// User-facing copy for a parse failure.
String messageForPairingParseFailure(PairingParseFailure reason) {
  switch (reason) {
    case PairingParseFailure.empty:
      return SyncUserMessages.clipboardEmpty;
    case PairingParseFailure.invalidJson:
      return SyncUserMessages.pairingInvalidJson;
    case PairingParseFailure.unsupportedVersion:
      return SyncUserMessages.pairingUnsupportedVersion;
    case PairingParseFailure.missingMasterKey:
      return SyncUserMessages.pairingMissingKey;
    case PairingParseFailure.badMasterKeyLength:
      return SyncUserMessages.pairingMissingKey;
    case PairingParseFailure.disallowedCloudUrl:
      return SyncUserMessages.pairingDisallowedCloudUrl;
    case PairingParseFailure.missingGrant:
      return SyncUserMessages.pairingMissingGrant;
    case PairingParseFailure.expired:
      return SyncUserMessages.pairingExpired;
    case PairingParseFailure.accountMismatch:
      return SyncUserMessages.pairingAccountMismatch;
  }
}

bool _masterKeyIs32Bytes(String b64) {
  try {
    final bytes = base64Decode(b64);
    return bytes.length == 32;
  } catch (_) {
    return false;
  }
}

bool _isExpired(Map<String, dynamic> payload) {
  final expires = payload['expires_at'];
  if (expires is String && expires.isNotEmpty) {
    final dt = DateTime.tryParse(expires);
    if (dt != null && dt.toUtc().isBefore(DateTime.now().toUtc())) return true;
  }
  final issued = payload['issued_at'];
  if (issued is String && issued.isNotEmpty) {
    final dt = DateTime.tryParse(issued);
    if (dt != null &&
        DateTime.now().toUtc().difference(dt.toUtc()) > const Duration(minutes: 30)) {
      return true;
    }
  }
  return false;
}

/// True when paste looks like the middle/end of desktop JSON (Simulator truncates often).
bool _looksLikeTruncatedPairingPaste(String text) {
  if (text.isEmpty) return false;
  if (!text.startsWith('{')) return true;
  // Starts with `{` but missing the v2 version key — usually a chopped clipboard.
  if (!text.contains('"v"')) return true;
  return false;
}

/// Validate trimmed pairing JSON.
PairingParseResult tryParsePairingPayload(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return const PairingParseFail(PairingParseFailure.empty);
  if (_looksLikeTruncatedPairingPaste(text)) {
    return const PairingParseFail(PairingParseFailure.invalidJson);
  }
  late final Object? decoded;
  try {
    decoded = jsonDecode(text);
  } catch (_) {
    return const PairingParseFail(PairingParseFailure.invalidJson);
  }
  if (decoded is! Map) {
    return const PairingParseFail(PairingParseFailure.invalidJson);
  }
  final payload = Map<String, dynamic>.from(decoded);
  // GA: only v2 with server grant (v1 QR is a full key handoff without account proof).
  final version = payload['v'];
  final isV2 = version == 2 || version == '2' || (version is num && version.toInt() == 2);
  if (!isV2) {
    return const PairingParseFail(PairingParseFailure.unsupportedVersion);
  }
  final mk = payload['master_key_b64'];
  if (mk is! String || mk.isEmpty) {
    return const PairingParseFail(PairingParseFailure.missingMasterKey);
  }
  if (!_masterKeyIs32Bytes(mk)) {
    return const PairingParseFail(PairingParseFailure.badMasterKeyLength);
  }
  final cloudUrl = payload['cloud_url'];
  if (cloudUrl != null && cloudUrl is! String) {
    return const PairingParseFail(PairingParseFailure.disallowedCloudUrl);
  }
  if (cloudUrl is String && !isAllowedPairingCloudUrl(cloudUrl)) {
    return const PairingParseFail(PairingParseFailure.disallowedCloudUrl);
  }
  if (_isExpired(payload)) {
    return const PairingParseFail(PairingParseFailure.expired);
  }
  final grant = payload['grant_token'];
  final accountId = payload['account_id'];
  if (grant is! String || grant.isEmpty) {
    return const PairingParseFail(PairingParseFailure.missingGrant);
  }
  if (accountId is! String || accountId.isEmpty) {
    return const PairingParseFail(PairingParseFailure.missingGrant);
  }
  return PairingParseOk(payload);
}

/// Parse, redeem grant when present, then [MobileSyncConfig.applyPairingPayload].
Future<PairingParseFailure?> applyPairingRaw(
  MobileSyncConfig config,
  String raw,
) async {
  final parsed = tryParsePairingPayload(raw);
  switch (parsed) {
    case PairingParseFail(:final reason):
      return reason;
    case PairingParseOk(:final payload):
      final grant = payload['grant_token'] as String;
      final expectedAccount = payload['account_id'] as String;
      final masterKeyB64 = payload['master_key_b64'] as String;
      // Compare QR account to signed-in JWT before burning the single-use grant.
      final signedInAccount = accountIdFromAccessToken(config.accessTokenSync);
      if (signedInAccount == null || signedInAccount != expectedAccount) {
        return PairingParseFailure.accountMismatch;
      }
      final fingerprint = masterKeyFingerprintB64(masterKeyB64);
      try {
        final redeemed = await config.api.redeemPairingGrant(
          grantToken: grant,
          keyFingerprint: fingerprint,
        );
        final redeemedAccount = redeemed['account_id'];
        if (redeemedAccount is String &&
            redeemedAccount.isNotEmpty &&
            redeemedAccount != expectedAccount) {
          return PairingParseFailure.accountMismatch;
        }
      } on CloudApiException catch (e) {
        if (e.statusCode == 410) return PairingParseFailure.expired;
        if (e.statusCode == 403) return PairingParseFailure.accountMismatch;
        // 400 invalid/already_redeemed — treat as expired pairing code.
        if (e.statusCode == 400) return PairingParseFailure.expired;
        return PairingParseFailure.accountMismatch;
      } on Object {
        return PairingParseFailure.accountMismatch;
      }
      await config.applyPairingPayload(payload);
      return null;
  }
}
