import 'package:flutter/material.dart';

import '../../calendars/apple_calendar.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';
import 'setup_copy.dart';

/// Skippable calendars. Google/Outlook are computer-only; Apple is on-device.
class SetupSourcesPanel extends StatelessWidget {
  const SetupSourcesPanel({
    super.key,
    required this.copy,
    required this.appleSupported,
    required this.apple,
    required this.appleBusy,
    required this.onUseApple,
    required this.onOpenSettings,
    required this.onContinue,
    required this.onSignOut,
  });

  final SetupCopy copy;
  final bool appleSupported;
  final AppleCalendarSnapshot apple;
  final bool appleBusy;
  final VoidCallback onUseApple;
  final VoidCallback onOpenSettings;
  final VoidCallback onContinue;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoMark(),
        const SizedBox(height: ExoSpacing.xxl),
        ExoSectionLabel(copy.sourcesEyebrow),
        const SizedBox(height: ExoSpacing.sm),
        Text(copy.sourcesTitle, style: textTheme.headlineSmall),
        const SizedBox(height: ExoSpacing.sm),
        Text(copy.sourcesComputerHint, style: textTheme.bodyMedium),
        const SizedBox(height: ExoSpacing.xl),
        ExoSurface(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(ExoSpacing.lg),
                child: Text(copy.sourcesGoogle, style: textTheme.bodyMedium),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(ExoSpacing.lg),
                child: Text(copy.sourcesOutlook, style: textTheme.bodyMedium),
              ),
            ],
          ),
        ),
        const SizedBox(height: ExoSpacing.lg),
        Text(copy.sourcesApplePurpose, style: textTheme.bodyMedium),
        const SizedBox(height: ExoSpacing.md),
        ..._appleBlock(),
        const SizedBox(height: ExoSpacing.xl),
        ExoPrimaryButton(label: copy.sourcesContinue, onPressed: onContinue),
        TextButton(
          onPressed: onSignOut,
          child: const Text(SyncUserMessages.signOutSwitchAccount),
        ),
      ],
    );
  }

  List<Widget> _appleBlock() {
    if (!appleSupported) {
      return [
        ExoStatusBanner(
          kind: ExoStatusKind.info,
          message: copy.sourcesAppleUnavailable,
        ),
      ];
    }
    if (appleBusy) {
      return [
        ExoSecondaryButton(
          label: copy.sourcesAppleAction,
          busy: true,
          onPressed: null,
        ),
      ];
    }
    switch (apple.status) {
      case AppleCalendarStatus.authorized:
        return [
          ExoStatusBanner(
            kind: ExoStatusKind.info,
            message: apple.calendarCount == 0
                ? copy.sourcesAppleNone
                : copy.sourcesAppleReady,
          ),
        ];
      case AppleCalendarStatus.denied:
        return [
          ExoStatusBanner(
            kind: ExoStatusKind.info,
            message: copy.sourcesAppleDenied,
            actionLabel: copy.sourcesOpenSettings,
            onAction: onOpenSettings,
          ),
        ];
      case AppleCalendarStatus.restricted:
        return [
          ExoStatusBanner(
            kind: ExoStatusKind.info,
            message: copy.sourcesAppleRestricted,
          ),
        ];
      case AppleCalendarStatus.notDetermined:
      case AppleCalendarStatus.unavailable:
        return [
          ExoSecondaryButton(
            label: copy.sourcesAppleAction,
            onPressed: onUseApple,
          ),
        ];
    }
  }
}
