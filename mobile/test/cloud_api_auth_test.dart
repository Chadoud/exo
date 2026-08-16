import 'package:exosites_mobile/sync/cloud_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('retries once after onUnauthorized succeeds', () async {
    var calls = 0;
    var token = 'old';
    final client = MockClient((request) async {
      calls++;
      if (calls == 1) return http.Response('unauthorized', 401);
      expect(request.headers['Authorization'], 'Bearer new');
      return http.Response('{"ok":true,"blobs":[],"cursor":0,"has_more":false}', 200);
    });

    final api = CloudApi(
      baseUrl: 'https://example.test',
      accessToken: () => token,
      onUnauthorized: () async {
        token = 'new';
        return true;
      },
      httpClient: client,
    );

    final body = await api.pullBlobs();
    expect(body['ok'], true);
    expect(calls, 2);
  });

  test('getMe reads /me profile', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/v1/me');
      expect(request.headers['Authorization'], 'Bearer tok');
      return http.Response('{"email":"chady@example.com","account_id":"a1"}', 200);
    });
    final api = CloudApi(
      baseUrl: 'https://example.test',
      accessToken: () => 'tok',
      httpClient: client,
    );
    final me = await api.getMe();
    expect(me['email'], 'chady@example.com');
  });

  test('CloudApiException exposes unauthorized', () {
    final e = CloudApiException(401, 'x');
    expect(e.isUnauthorized, isTrue);
    expect(e.toString(), contains('401'));
  });
}
