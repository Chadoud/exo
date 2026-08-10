import 'package:flutter/material.dart';

import '../app/mobile_sync_config.dart';
import '../design/exo_widgets.dart';
import 'user_messages.dart';

/// Why a sync-backed list is empty (excluding search).
enum SyncListEmptyKind {
  unpaired,
  neverPulled,
  syncedEmpty,
}

SyncListEmptyKind classifySyncListEmpty(MobileSyncConfig config) {
  if (!config.isPaired) return SyncListEmptyKind.unpaired;
  if (!config.hasEverSynced) return SyncListEmptyKind.neverPulled;
  return SyncListEmptyKind.syncedEmpty;
}

/// Honest empty for Memory or Tasks — never collapses unpaired into “desktop has nothing”.
class SyncCollectionEmpty extends StatelessWidget {
  const SyncCollectionEmpty({
    super.key,
    required this.kind,
    required this.syncedEmptyTitle,
    required this.syncedEmptySubtitle,
    required this.icon,
    this.syncInFlight = false,
    this.onPair,
  });

  final SyncListEmptyKind kind;
  final String syncedEmptyTitle;
  final String syncedEmptySubtitle;
  final IconData icon;
  final bool syncInFlight;
  final VoidCallback? onPair;

  @override
  Widget build(BuildContext context) {
    switch (kind) {
      case SyncListEmptyKind.unpaired:
        return ExoEmptyState(
          title: SyncUserMessages.syncEmptyUnpairedTitle,
          subtitle: SyncUserMessages.syncEmptyUnpairedSubtitle,
          icon: Icons.link_off_outlined,
          actionLabel: onPair == null ? null : SyncUserMessages.pairAgain,
          onAction: onPair,
        );
      case SyncListEmptyKind.neverPulled:
        return ExoEmptyState(
          title: SyncUserMessages.syncEmptyNeverPulledTitle,
          subtitle: syncInFlight
              ? SyncUserMessages.syncEmptyNeverPulledSubtitle
              : SyncUserMessages.syncEmptyNeverPulledIdleSubtitle,
          icon: Icons.cloud_download_outlined,
        );
      case SyncListEmptyKind.syncedEmpty:
        return ExoEmptyState(
          title: syncedEmptyTitle,
          subtitle: syncedEmptySubtitle,
          icon: icon,
        );
    }
  }
}
