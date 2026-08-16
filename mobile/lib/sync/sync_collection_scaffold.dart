import 'package:flutter/material.dart';

import '../app/mobile_sync_config.dart';
import '../design/exo_colors.dart';
import '../design/exo_spacing.dart';
import 'sync_status_banner.dart';

/// Shared pull-to-refresh + session banner shell for sync-backed tabs.
class SyncCollectionScaffold extends StatelessWidget {
  const SyncCollectionScaffold({
    super.key,
    required this.config,
    required this.listBody,
    this.header,
    this.onSignInAgain,
    this.onPairAgain,
    this.onRefresh,
    this.showReadyWhenSynced = false,
  });

  final MobileSyncConfig config;
  final Widget listBody;
  final Widget? header;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;
  /// Called when the user pulls to refresh or taps Retry (e.g. clear selection).
  final VoidCallback? onRefresh;
  final bool showReadyWhenSynced;

  Future<void> _refresh() async {
    onRefresh?.call();
    try {
      await config.syncNow();
    } catch (_) {
      // [MobileSyncConfig.lastError] already set for the banner.
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: config,
      builder: (context, _) {
        return Column(
          children: [
            if (header != null) header!,
            Padding(
              padding: const EdgeInsets.fromLTRB(
                ExoSpacing.lg,
                ExoSpacing.sm,
                ExoSpacing.lg,
                ExoSpacing.sm,
              ),
              child: SyncStatusBanner(
                config: config,
                onSignInAgain: onSignInAgain,
                onPairAgain: onPairAgain,
                onRetry: _refresh,
                showReadyWhenSynced: showReadyWhenSynced,
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: ExoColors.brandPrimary,
                backgroundColor: ExoColors.bgElevated,
                onRefresh: _refresh,
                child: listBody,
              ),
            ),
          ],
        );
      },
    );
  }
}
