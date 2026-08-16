import 'dart:convert';

import 'package:http/http.dart' as http;

/// Cloud relay HTTP client — auth, device registration, blob push/pull.
class CloudApi {
  CloudApi({
    required this.baseUrl,
    required String Function() accessToken,
    Future<bool> Function()? onUnauthorized,
    http.Client? httpClient,
  })  : _accessToken = accessToken,
        _onUnauthorized = onUnauthorized,
        _http = httpClient ?? http.Client();

  final String baseUrl;
  final String Function() _accessToken;
  final Future<bool> Function()? _onUnauthorized;
  final http.Client _http;

  Map<String, String> get _headers => {
        'Authorization': 'Bearer ${_accessToken()}',
        'Content-Type': 'application/json',
      };

  Future<Map<String, dynamic>> getMe() async {
    final res = await _send(() => _http.get(Uri.parse('$baseUrl/v1/me'), headers: _headers));
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> syncStatus() async {
    final res = await _send(() => _http.get(Uri.parse('$baseUrl/v1/sync/status'), headers: _headers));
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> registerDevice({
    required String deviceId,
    required String name,
    String platform = 'ios',
    String? pushToken,
  }) async {
    final res = await _send(
      () => _http.post(
        Uri.parse('$baseUrl/v1/sync/devices/register'),
        headers: _headers,
        body: jsonEncode({
          'device_id': deviceId,
          'name': name,
          'platform': platform,
          'push_token': pushToken,
        }),
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> pushBlobs(List<Map<String, dynamic>> blobs) async {
    final res = await _send(
      () => _http.post(
        Uri.parse('$baseUrl/v1/sync/blobs/push'),
        headers: _headers,
        body: jsonEncode({'blobs': blobs}),
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> pullBlobs({
    int cursor = 0,
    int limit = 200,
    int snapshotOffset = 0,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/sync/blobs/pull').replace(
      queryParameters: {
        'cursor': '$cursor',
        'limit': '$limit',
        'snapshot_offset': '$snapshotOffset',
      },
    );
    final res = await _send(() => _http.get(uri, headers: _headers));
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  /// Redeem a desktop pairing grant (JWT account + key fingerprint must match).
  Future<Map<String, dynamic>> redeemPairingGrant({
    required String grantToken,
    required String keyFingerprint,
  }) async {
    final res = await _send(
      () => _http.post(
        Uri.parse('$baseUrl/v1/sync/pairing/redeem'),
        headers: _headers,
        body: jsonEncode({
          'grant_token': grantToken,
          'key_fingerprint': keyFingerprint,
        }),
      ),
    );
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request();
    } catch (e) {
      throw CloudApiException(0, e.toString());
    }
    final onUnauthorized = _onUnauthorized;
    if (res.statusCode == 401 && onUnauthorized != null) {
      final refreshed = await onUnauthorized();
      if (refreshed) {
        try {
          res = await request();
        } catch (e) {
          throw CloudApiException(0, e.toString());
        }
      }
    }
    _ensureOk(res);
    return res;
  }

  void _ensureOk(http.Response res) {
    if (res.statusCode >= 400) {
      throw CloudApiException(res.statusCode, res.body);
    }
  }
}

class CloudApiException implements Exception {
  CloudApiException(this.statusCode, this.body);
  final int statusCode;
  final String body;

  bool get isUnauthorized => statusCode == 401;
  bool get isNetwork => statusCode == 0;

  @override
  String toString() => 'CloudApiException($statusCode): $body';
}
