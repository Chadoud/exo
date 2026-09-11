import 'dart:async';

/// Store listing. [priceLabel] is whatever the store returned — never invented.
class StoreListing {
  const StoreListing({
    required this.available,
    this.priceLabel,
    this.productId,
  });

  final bool available;
  final String? priceLabel;
  final String? productId;
}

enum StorePurchasePhase { pending, purchased, canceled, error }

class StorePurchaseUpdate {
  const StorePurchaseUpdate({
    required this.phase,
    this.signedJws,
    this.purchaseToken,
    this.errorMessage,
  });

  final StorePurchasePhase phase;
  final String? signedJws;
  final String? purchaseToken;
  final String? errorMessage;
}

/// Phone IAP. Cloud verify is the only entitlement truth.
abstract class StoreBilling {
  Future<StoreListing> loadListing();

  Stream<StorePurchaseUpdate> get updates;

  Future<void> startPurchase();

  Future<void> restore();

  void dispose();
}

/// Test double. Price is a store-returned fixture, not a product invention.
class FakeStoreBilling implements StoreBilling {
  FakeStoreBilling({
    this.listing = const StoreListing(
      available: true,
      priceLabel: 'CHF 20.00',
      productId: 'exo.pro.monthly',
    ),
    this.purchase = const StorePurchaseUpdate(
      phase: StorePurchasePhase.purchased,
      signedJws: 'e30.e30.sig',
    ),
    this.restoreUpdate,
  });

  StoreListing listing;
  StorePurchaseUpdate purchase;
  StorePurchaseUpdate? restoreUpdate;
  final _controller = StreamController<StorePurchaseUpdate>.broadcast();

  @override
  Stream<StorePurchaseUpdate> get updates => _controller.stream;

  @override
  Future<StoreListing> loadListing() async => listing;

  @override
  Future<void> startPurchase() async {
    _controller.add(purchase);
  }

  @override
  Future<void> restore() async {
    final update = restoreUpdate;
    if (update != null) _controller.add(update);
  }

  @override
  void dispose() {
    _controller.close();
  }
}
