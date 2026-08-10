import 'package:flutter/material.dart';

import '../app/mobile_sync_config.dart';
import '../design/exo_status_banner.dart';
import 'sync_banner_actions.dart';
import 'user_messages.dart';

/// Session-driven status strip for Memory / Tasks (single source of truth).
class SyncStatusBanner extends StatelessWidget {
  const SyncStatusBanner({
    super.key,
    required this.config,
    this.onSignInAgain,
    this.onPairAgain,
    this.onRetry,
    this.showReadyWhenSynced = false,
  });

  final MobileSyncConfig config;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;
  final VoidCallback? onRetry;
  final bool showReadyWhenSynced;

  void _run(SyncBannerAction action) {
    switch (action) {
      case SyncBannerAction.signIn:
        onSignInAgain?.call();
      case SyncBannerAction.pair:
        onPairAgain?.call();
      case SyncBannerAction.retry:
        onRetry?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (config.syncInFlight) {
      return const ExoStatusBanner(
        kind: ExoStatusKind.syncing,
        message: SyncUserMessages.updatingFromDesktop,
        busy: true,
      );
    }

    final err = config.lastError;
    if (err != null) {
      final mapped = bannerActionFor(err.kind);
      return ExoStatusBanner(
        kind: err.kind,
        message: err.message,
        actionLabel: mapped?.$1,
        onAction: mapped == null ? null : () => _run(mapped.$2),
      );
    }

    if (!config.isPaired) {
      return ExoStatusBanner(
        kind: ExoStatusKind.needsPair,
        message: SyncUserMessages.notPaired,
        actionLabel: SyncUserMessages.pairAgain,
        onAction: onPairAgain,
      );
    }

    if (showReadyWhenSynced && config.hasEverSynced) {
      return ExoStatusBanner(
        kind: ExoStatusKind.ready,
        message: SyncUserMessages.upToDate(config.cachedMemoryCount),
      );
    }

    return const SizedBox.shrink();
  }
}
