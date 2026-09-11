import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../billing/iap_store_billing.dart';
import '../../billing/store_billing.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../sync/user_messages.dart';
import '../setup/setup_copy.dart';
import '../setup/setup_me.dart';
import '../setup/setup_trial_step.dart';

/// Settings → Account: Restore. Hosts the trial legal block when still required.
class StoreRestoreSection extends StatefulWidget {
  const StoreRestoreSection({
    super.key,
    required this.config,
    this.storeBilling,
    this.onVerified,
  });

  final MobileSyncConfig config;
  final StoreBilling? storeBilling;
  final ValueChanged<SetupMeSnapshot>? onVerified;

  @override
  State<StoreRestoreSection> createState() => _StoreRestoreSectionState();
}

class _StoreRestoreSectionState extends State<StoreRestoreSection> {
  SetupMeSnapshot _me = SetupMeSnapshot.empty;
  bool _loading = true;
  bool _loadError = false;

  @override
  void initState() {
    super.initState();
    _refreshMe();
  }

  Future<void> _refreshMe() async {
    if (!widget.config.isSignedIn) {
      setState(() {
        _loading = false;
        _loadError = false;
        _me = SetupMeSnapshot.empty;
      });
      return;
    }
    try {
      final me = SetupMeSnapshot.fromJson(await widget.config.api.getMe());
      if (!mounted) return;
      setState(() {
        _me = me;
        _loading = false;
        _loadError = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.config.isSignedIn) return const SizedBox.shrink();
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.only(top: ExoSpacing.lg),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_loadError) {
      return Padding(
        padding: const EdgeInsets.only(top: ExoSpacing.lg),
        child: ExoStatusBanner(
          kind: ExoStatusKind.error,
          message: SetupCopy.of(context).meLoadFailed,
          actionLabel: SyncUserMessages.tryAgain,
          onAction: _refreshMe,
        ),
      );
    }
    if (!_me.storeCheckoutRequired) {
      return _RestoreOnly(
        config: widget.config,
        storeBilling: widget.storeBilling,
        onVerified: (me) {
          setState(() => _me = me);
          widget.onVerified?.call(me);
        },
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: ExoSpacing.xl),
      child: SetupTrialStep(
        config: widget.config,
        storeBilling: widget.storeBilling,
        compact: true,
        onVerified: (me) {
          setState(() => _me = me);
          widget.onVerified?.call(me);
        },
        onSignOut: () async {},
      ),
    );
  }
}

class _RestoreOnly extends StatelessWidget {
  const _RestoreOnly({
    required this.config,
    this.storeBilling,
    required this.onVerified,
  });

  final MobileSyncConfig config;
  final StoreBilling? storeBilling;
  final ValueChanged<SetupMeSnapshot> onVerified;

  @override
  Widget build(BuildContext context) {
    final copy = SetupCopy.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: ExoSpacing.lg),
      child: TextButton(
        onPressed: () async {
          final store = storeBilling ?? IapStoreBilling();
          await store.restore();
          if (storeBilling == null) store.dispose();
          try {
            final me = SetupMeSnapshot.fromJson(await config.api.getMe());
            onVerified(me);
          } catch (_) {}
        },
        child: Text(copy.restorePurchases),
      ),
    );
  }
}
