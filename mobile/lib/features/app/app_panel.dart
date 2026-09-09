import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/exo_config.dart';
import '../../app/mobile_sync_config.dart';
import '../../design/exo_choice_chips.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../notifications/due_reminder_scope.dart';
import '../../telemetry/mobile_crash_reporter.dart';
import '../auth/mobile_auth_service.dart';
import '../settings/pairing_screen.dart';
import '../settings/reminder_settings_section.dart';
import '../settings/source_stop_section.dart';
import '../settings/sources_connect_hint.dart';
import '../settings/sync_debug_section.dart';
import 'app_sub_tab.dart';
import 'settings_copy.dart';

/// Settings tab body — one sub-tab at a time (desktop Settings children, phone-sized).
class AppPanel extends StatefulWidget {
  const AppPanel({
    super.key,
    required this.config,
    this.auth,
    this.subTab = AppSubTab.account,
    this.onSubTab,
  });

  final MobileSyncConfig config;
  final MobileAuthService? auth;
  final AppSubTab subTab;
  final ValueChanged<AppSubTab>? onSubTab;

  @override
  State<AppPanel> createState() => _AppPanelState();
}

class _AppPanelState extends State<AppPanel> {
  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    widget.config.refreshAccountProfile();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    super.dispose();
  }

  void _onConfig() {
    if (mounted) setState(() {});
  }

  Future<void> _openPairing() async {
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

  Future<void> _confirmSignOut(SettingsCopy copy) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(copy.signOutTitle),
        content: Text(copy.signOutBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(copy.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(copy.signOut),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final reminders = DueReminderScope.maybeOf(context);
    await widget.config.clearSession();
    await reminders?.host.cancelAll();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(copy.signedOutSnack)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cfg = widget.config;
    final copy = SettingsCopy.of(context);
    return ListView(
      padding: const EdgeInsets.all(ExoSpacing.lg),
      children: [
        ExoContentWidth(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ExoChoiceChips<AppSubTab>(
                options: [
                  for (final tab in AppSubTab.values) (tab, copy.chip(tab)),
                ],
                selected: widget.subTab,
                onSelected: (tab) => widget.onSubTab?.call(tab),
              ),
              const SizedBox(height: ExoSpacing.xl),
              switch (widget.subTab) {
                AppSubTab.link => _LinkBody(
                    config: cfg,
                    copy: copy,
                    onPair: _openPairing,
                  ),
                AppSubTab.account => _AccountBody(
                    config: cfg,
                    copy: copy,
                    onSignOut: (cfg.isSignedIn || cfg.isPaired)
                        ? () => _confirmSignOut(copy)
                        : null,
                  ),
                AppSubTab.reminders => _RemindersBody(config: cfg),
                AppSubTab.sources => _SourcesBody(config: cfg),
                AppSubTab.privacy => _PrivacyBody(config: cfg, copy: copy),
              },
            ],
          ),
        ),
      ],
    );
  }
}

class _LinkBody extends StatelessWidget {
  const _LinkBody({
    required this.config,
    required this.copy,
    required this.onPair,
  });

  final MobileSyncConfig config;
  final SettingsCopy copy;
  final VoidCallback onPair;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExoSectionLabel(copy.desktopSection),
        const SizedBox(height: ExoSpacing.sm),
        ExoSyncStatusBanner(
          message: !config.isPaired
              ? copy.linkUnpaired
              : config.hasEverSynced
                  ? copy.linkPaired
                  : copy.linkPairedPending,
          isError: !config.isPaired,
        ),
        const SizedBox(height: ExoSpacing.md),
        ExoPrimaryButton(
          label: config.isPaired ? copy.scanNewCode : copy.scanDesktopCode,
          onPressed: onPair,
        ),
        const SizedBox(height: ExoSpacing.xl),
        SyncDebugSection(config: config),
      ],
    );
  }
}

class _AccountBody extends StatelessWidget {
  const _AccountBody({
    required this.config,
    required this.copy,
    this.onSignOut,
  });

  final MobileSyncConfig config;
  final SettingsCopy copy;
  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) {
    final lastUpdate = config.hasEverSynced && config.lastSyncLabel != null
        ? copy.lastUpdate(config.lastSyncLabel!)
        : copy.lastUpdateNever;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExoSectionLabel(copy.accountSection),
        const SizedBox(height: ExoSpacing.sm),
        ExoSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                config.isSignedIn
                    ? (config.accountEmail ?? copy.signedIn)
                    : copy.signedOut,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: ExoSpacing.xs),
              Text(lastUpdate, style: Theme.of(context).textTheme.bodySmall),
              if (config.hasEverSynced) ...[
                const SizedBox(height: ExoSpacing.xs),
                Text(
                  copy.factsOnPhone(config.cachedMemoryCount),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
        if (onSignOut != null) ...[
          const SizedBox(height: ExoSpacing.xl),
          OutlinedButton(
            onPressed: onSignOut,
            child: Text(copy.signOut),
          ),
        ],
      ],
    );
  }
}

class _RemindersBody extends StatelessWidget {
  const _RemindersBody({required this.config});

  final MobileSyncConfig config;

  @override
  Widget build(BuildContext context) {
    return ReminderSettingsSection(config: config);
  }
}

class _SourcesBody extends StatelessWidget {
  const _SourcesBody({required this.config});

  final MobileSyncConfig config;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SourcesConnectHint(),
        SourceStopSection(config: config),
      ],
    );
  }
}

class _PrivacyBody extends StatelessWidget {
  const _PrivacyBody({required this.config, required this.copy});

  final MobileSyncConfig config;
  final SettingsCopy copy;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExoSectionLabel(copy.privacySection),
        const SizedBox(height: ExoSpacing.sm),
        ExoSurface(
          padding: const EdgeInsets.symmetric(vertical: ExoSpacing.sm),
          child: Column(
            children: [
              SwitchListTile(
                title: Text(copy.crashTitle),
                subtitle: Text(
                  MobileCrashReporter.isBuildConfigured
                      ? copy.crashOn
                      : copy.crashOff,
                ),
                value: config.crashReportsOptIn,
                onChanged: MobileCrashReporter.isBuildConfigured
                    ? (v) => config.setCrashReportsOptIn(v)
                    : null,
              ),
              const Divider(height: 1),
              ListTile(
                title: Text(copy.privacyPolicy),
                trailing: const Icon(Icons.open_in_new, size: 18),
                onTap: () => launchUrl(
                  Uri.parse(ExoConfig.privacyPolicyUrl),
                  mode: LaunchMode.externalApplication,
                ),
              ),
              const Divider(height: 1),
              ListTile(
                title: Text(copy.terms),
                trailing: const Icon(Icons.open_in_new, size: 18),
                onTap: () => launchUrl(
                  Uri.parse(ExoConfig.termsOfServiceUrl),
                  mode: LaunchMode.externalApplication,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
