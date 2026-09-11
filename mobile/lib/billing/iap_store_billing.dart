import 'dart:async';
import 'dart:io';

import 'package:in_app_purchase/in_app_purchase.dart';

import '../app/exo_config.dart';
import 'store_billing.dart';

/// Official `in_app_purchase` adapter. No IAP secrets in the binary.
class IapStoreBilling implements StoreBilling {
  IapStoreBilling({
    InAppPurchase? iap,
    String? productId,
  })  : _iap = iap ?? InAppPurchase.instance,
        _productId = productId ?? ExoConfig.iapProductId;

  final InAppPurchase _iap;
  final String _productId;
  StreamSubscription<List<PurchaseDetails>>? _sub;
  final _controller = StreamController<StorePurchaseUpdate>.broadcast();
  ProductDetails? _product;

  @override
  Stream<StorePurchaseUpdate> get updates => _controller.stream;

  @override
  Future<StoreListing> loadListing() async {
    _listen();
    final available = await _iap.isAvailable();
    if (!available || _productId.isEmpty) {
      return const StoreListing(available: false);
    }
    final response = await _iap.queryProductDetails({_productId});
    if (response.productDetails.isEmpty) {
      return StoreListing(available: false, productId: _productId);
    }
    _product = response.productDetails.first;
    return StoreListing(
      available: true,
      priceLabel: _product!.price,
      productId: _product!.id,
    );
  }

  @override
  Future<void> startPurchase() async {
    final product = _product;
    if (product == null) {
      _controller.add(
        const StorePurchaseUpdate(
          phase: StorePurchasePhase.error,
          errorMessage: 'unavailable',
        ),
      );
      return;
    }
    await _iap.buyNonConsumable(purchaseParam: PurchaseParam(productDetails: product));
  }

  @override
  Future<void> restore() async {
    _listen();
    await _iap.restorePurchases();
  }

  void _listen() {
    _sub ??= _iap.purchaseStream.listen(_onPurchases);
  }

  void _onPurchases(List<PurchaseDetails> purchases) {
    for (final purchase in purchases) {
      final update = _mapPurchase(purchase);
      _controller.add(update);
      if (purchase.pendingCompletePurchase) {
        unawaited(_iap.completePurchase(purchase));
      }
    }
  }

  StorePurchaseUpdate _mapPurchase(PurchaseDetails purchase) {
    switch (purchase.status) {
      case PurchaseStatus.pending:
        return const StorePurchaseUpdate(phase: StorePurchasePhase.pending);
      case PurchaseStatus.canceled:
        return const StorePurchaseUpdate(phase: StorePurchasePhase.canceled);
      case PurchaseStatus.error:
        return StorePurchaseUpdate(
          phase: StorePurchasePhase.error,
          errorMessage: purchase.error?.message,
        );
      case PurchaseStatus.purchased:
      case PurchaseStatus.restored:
        final data = purchase.verificationData.serverVerificationData;
        if (Platform.isIOS) {
          return StorePurchaseUpdate(phase: StorePurchasePhase.purchased, signedJws: data);
        }
        return StorePurchaseUpdate(phase: StorePurchasePhase.purchased, purchaseToken: data);
    }
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    _controller.close();
  }
}
