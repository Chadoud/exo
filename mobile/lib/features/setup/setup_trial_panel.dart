import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/exo_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import 'setup_copy.dart';

/// Legal + Start / Restore. Price is the store string or an honest fallback.
class SetupTrialPanel extends StatelessWidget {
  const SetupTrialPanel({
    super.key,
    required this.copy,
    required this.storePrice,
    required this.busy,
    this.error,
    required this.onStart,
    required this.onRestore,
    this.onSignOut,
    this.startEnabled = true,
    this.compact = false,
  });

  final SetupCopy copy;
  final String? storePrice;
  final bool busy;
  final String? error;
  final VoidCallback onStart;
  final VoidCallback onRestore;
  final VoidCallback? onSignOut;
  final bool startEnabled;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          const ExoMark(),
          const SizedBox(height: ExoSpacing.xxl),
        ],
        ExoSectionLabel(copy.trialEyebrow),
        if (!compact) ...[
          const SizedBox(height: ExoSpacing.sm),
          Text(copy.trialTitle, style: textTheme.headlineSmall),
        ],
        const SizedBox(height: ExoSpacing.sm),
        Text(copy.priceLine(storePrice), style: textTheme.bodyMedium),
        if (!compact) ...[
          const SizedBox(height: ExoSpacing.sm),
          Text(copy.inboxEmptyHint, style: textTheme.bodyMedium),
        ],
        if (error != null) ...[
          const SizedBox(height: ExoSpacing.lg),
          ExoStatusBanner(kind: ExoStatusKind.error, message: error!),
        ],
        const SizedBox(height: ExoSpacing.xl),
        ExoPrimaryButton(
          label: copy.startTrial,
          busy: busy,
          onPressed: startEnabled ? onStart : null,
        ),
        const SizedBox(height: ExoSpacing.sm),
        TextButton(
          onPressed: busy ? null : onRestore,
          child: Text(copy.restorePurchases),
        ),
        const SizedBox(height: ExoSpacing.lg),
        Wrap(
          spacing: ExoSpacing.md,
          children: [
            TextButton(
              onPressed: () => launchUrl(
                Uri.parse(ExoConfig.privacyPolicyUrl),
                mode: LaunchMode.externalApplication,
              ),
              child: Text(copy.privacy),
            ),
            TextButton(
              onPressed: () => launchUrl(
                Uri.parse(ExoConfig.termsOfServiceUrl),
                mode: LaunchMode.externalApplication,
              ),
              child: Text(copy.terms),
            ),
          ],
        ),
        if (!compact && onSignOut != null)
          ExoSecondaryButton(
            label: copy.signOut,
            onPressed: busy ? null : onSignOut,
          ),
      ],
    );
  }
}
