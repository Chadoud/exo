import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/exo_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';
import '../../telemetry/mobile_crash_reporter.dart';
import '../auth/mobile_auth_service.dart';
import '../../app/mobile_sync_config.dart';
import 'pairing_screen.dart';

/// Account, pairing, privacy — post-setup hub (no Profile tab).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.config,
    this.auth,
  });

  final MobileSyncConfig config;

  /// Shared auth from app root (optional; pairing does not need a second listener).
  final MobileAuthService? auth;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    super.dispose();
  }

  void _onConfig() {
    if (mounted) setState(() {});
  }

  Future<void> _pair() async {
    final paired = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PairingScreen(config: widget.config)),
    );
    if (paired == true && mounted) {
      try {
        await widget.config.registerDeviceIfNeeded();
      } catch (_) {}
      setState(() {});
    }
  }

  Future<void> _confirmSignOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(SyncUserMessages.signOutConfirmTitle),
        content: const Text(SyncUserMessages.signOutConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(SyncUserMessages.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(SyncUserMessages.signOut),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await widget.config.clearSession();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(SyncUserMessages.signedOutSnack)),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final cfg = widget.config;
    final lastUpdate = cfg.hasEverSynced && cfg.lastSyncLabel != null
        ? SyncUserMessages.settingsLastUpdate(cfg.lastSyncLabel!)
        : SyncUserMessages.settingsLastUpdateNever;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          ExoConfig.displayFlavor.isEmpty ? 'Settings' : 'Settings (${ExoConfig.displayFlavor})',
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(ExoSpacing.lg),
        children: [
          ExoContentWidth(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ExoSectionLabel('Account'),
                const SizedBox(height: ExoSpacing.sm),
                ExoSurface(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        cfg.isSignedIn
                            ? SyncUserMessages.settingsAccountSignedIn
                            : SyncUserMessages.settingsAccountSignedOut,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: ExoSpacing.xs),
                      Text(
                        lastUpdate,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: ExoSpacing.xl),
                const ExoSectionLabel('Desktop link'),
                const SizedBox(height: ExoSpacing.sm),
                ExoSyncStatusBanner(
                  message: !cfg.isPaired
                      ? SyncUserMessages.settingsLinkUnpaired
                      : cfg.hasEverSynced
                          ? SyncUserMessages.settingsLinkPaired
                          : SyncUserMessages.settingsLinkPairedPendingPull,
                  isError: !cfg.isPaired,
                ),
                const SizedBox(height: ExoSpacing.md),
                ExoPrimaryButton(
                  label: cfg.isPaired ? 'Re-pair device' : SyncUserMessages.scanDesktopCode,
                  onPressed: _pair,
                ),
                const SizedBox(height: ExoSpacing.xl),
                const ExoSectionLabel('Privacy'),
                const SizedBox(height: ExoSpacing.sm),
                ExoSurface(
                  padding: const EdgeInsets.symmetric(vertical: ExoSpacing.sm),
                  child: Column(
                    children: [
                      SwitchListTile(
                        title: const Text('Send crash reports'),
                        subtitle: Text(
                          MobileCrashReporter.isBuildConfigured
                              ? 'Help fix bugs by sending anonymous crash data when the app fails.'
                              : 'Crash reporting is not configured in this build.',
                        ),
                        value: cfg.crashReportsOptIn,
                        onChanged: MobileCrashReporter.isBuildConfigured
                            ? (v) async {
                                await cfg.setCrashReportsOptIn(v);
                                if (mounted) setState(() {});
                              }
                            : null,
                      ),
                      const Divider(height: 1),
                      ListTile(
                        title: const Text('Privacy policy'),
                        trailing: const Icon(Icons.open_in_new, size: 18),
                        onTap: () => launchUrl(
                          Uri.parse(ExoConfig.privacyPolicyUrl),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                      const Divider(height: 1),
                      ListTile(
                        title: const Text('Terms of service'),
                        trailing: const Icon(Icons.open_in_new, size: 18),
                        onTap: () => launchUrl(
                          Uri.parse(ExoConfig.termsOfServiceUrl),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: ExoSpacing.md),
                Text(
                  SyncUserMessages.captureComingSoon,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (cfg.isSignedIn || cfg.isPaired) ...[
                  const SizedBox(height: ExoSpacing.xl),
                  OutlinedButton(
                    onPressed: _confirmSignOut,
                    child: const Text(SyncUserMessages.signOut),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}