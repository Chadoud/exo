import 'package:exosites_mobile/sync/cloud_api.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('CloudApiException carries status code and body', () {
    final ex = CloudApiException(401, '{"detail":"invalid_token"}');
    expect(ex.statusCode, 401);
    expect(ex.body, contains('invalid_token'));
    expect(ex.toString(), contains('401'));
  });

  test('isStoreCheckoutRequired is only 402 with that detail', () {
    expect(
      CloudApiException(402, '{"detail":"store_checkout_required"}')
          .isStoreCheckoutRequired,
      isTrue,
    );
    expect(
      CloudApiException(403, '{"detail":"store_checkout_required"}')
          .isStoreCheckoutRequired,
      isFalse,
    );
    expect(
      CloudApiException(402, '{"detail":"payment_required"}')
          .isStoreCheckoutRequired,
      isFalse,
    );
  });
}
