import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../billing/iap_store_billing.dart';
import '../../billing/store_billing.dart';
import '../../sync/cloud_api.dart';
import 'setup_copy.dart';
import 'setup_me.dart';
import 'setup_trial_panel.dart';

/// Loads store price, starts IAP, then leaves only after cloud verify + /me.
class SetupTrialStep extends StatefulWidget {
  const SetupTrialStep({
    super.key,
    required this.config,
    required this.onVerified,
    required this.onSignOut,
    this.storeBilling,
    this.compact = false,
  });

  final MobileSyncConfig config;
  final ValueChanged<SetupMeSnapshot> onVerified;
  final Future<void> Function() onSignOut;
  final StoreBilling? storeBilling;
  final bool compact;

  @override
  State<SetupTrialStep> createState() => _SetupTrialStepState();
}

class _SetupTrialStepState extends State<SetupTrialStep> {
  static const _restoreQuietWindow = Duration(milliseconds: 800);

  late final StoreBilling _store;
  late final bool _ownsStore;
  StreamSubscription<StorePurchaseUpdate>? _sub;
  StoreListing? _listing;
  bool _busy = false;
  bool _awaitingRestore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ownsStore = widget.storeBilling == null;
    _store = widget.storeBilling ?? IapStoreBilling();
    _sub = _store.updates.listen(_onPurchase);
    _loadListing();
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    if (_ownsStore) _store.dispose();
    super.dispose();
  }

  Future<void> _loadListing() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final listing = await _store.loadListing();
      if (!mounted) return;
      setState(() {
        _listing = listing;
        _busy = false;
        if (!listing.available) {
          _error = SetupCopy.of(context).storeUnavailable;
        } else if (listing.priceLabel == null || listing.priceLabel!.isEmpty) {
          _error = SetupCopy.of(context).storePriceUnavailable;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = SetupCopy.of(context).storeUnavailable;
      });
    }
  }

  Future<void> _onPurchase(StorePurchaseUpdate update) async {
    if (!mounted) return;
    _awaitingRestore = false;
    final copy = SetupCopy.of(context);
    if (update.phase == StorePurchasePhase.canceled) {
      setState(() => _busy = false);
      return;
    }
    if (update.phase == StorePurchasePhase.pending) {
      setState(() {
        _busy = true;
        _error = null;
      });
      return;
    }
    if (update.phase == StorePurchasePhase.error) {
      setState(() {
        _busy = false;
        _error = copy.purchaseFailed;
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _verify(update);
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = copy.verifyFailed;
        });
      }
    }
  }

  Future<void> _verify(StorePurchaseUpdate update) async {
    final copy = SetupCopy.of(context);
    final platform = Platform.isIOS ? 'apple' : 'play';
    try {
      await widget.config.api.verifyStorePurchase(
        platform: platform,
        signedJws: update.signedJws,
        purchaseToken: update.purchaseToken,
      );
    } on CloudApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.statusCode == 409 ? copy.ownedByOtherAccount : copy.verifyFailed;
      });
      return;
    }
    final me = SetupMeSnapshot.fromJson(await widget.config.api.getMe());
    if (!mounted) return;
    if (me.storeCheckoutRequired) {
      setState(() {
        _busy = false;
        _error = copy.verifyFailed;
      });
      return;
    }
    widget.onVerified(me);
  }

  Future<void> _restore() async {
    setState(() {
      _busy = true;
      _error = null;
      _awaitingRestore = true;
    });
    try {
      await _store.restore();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _awaitingRestore = false;
        _error = SetupCopy.of(context).restoreEmpty;
      });
      return;
    }
    await Future<void>.delayed(_restoreQuietWindow);
    if (!mounted || !_awaitingRestore) return;
    setState(() {
      _busy = false;
      _awaitingRestore = false;
      _error = SetupCopy.of(context).restoreEmpty;
    });
  }

  @override
  Widget build(BuildContext context) {
    final copy = SetupCopy.of(context);
    final listing = _listing;
    return SetupTrialPanel(
      copy: copy,
      storePrice: listing?.priceLabel,
      busy: _busy,
      error: _error,
      startEnabled: listing?.available == true &&
          listing?.priceLabel != null &&
          listing!.priceLabel!.isNotEmpty,
      onStart: () => _store.startPurchase(),
      onRestore: _restore,
      onSignOut: widget.compact ? null : () => widget.onSignOut(),
      compact: widget.compact,
    );
  }
}
