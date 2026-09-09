import 'package:flutter/material.dart';

import '../../app/exo_config.dart';
import '../../app/mobile_sync_config.dart';
import '../../sync/user_messages.dart';
import '../app/app_panel.dart';
import '../app/app_sub_tab.dart';
import '../auth/mobile_auth_service.dart';

/// Standalone Settings hub (tests / leftover routes). The shell embeds [AppPanel].
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.config,
    this.auth,
    this.initialSubTab = AppSubTab.account,
  });

  final MobileSyncConfig config;
  final MobileAuthService? auth;
  final AppSubTab initialSubTab;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late AppSubTab _subTab = widget.initialSubTab;

  @override
  Widget build(BuildContext context) {
    final title = ExoConfig.displayFlavor.isEmpty
        ? SyncUserMessages.settingsTitle
        : '${SyncUserMessages.settingsTitle} (${ExoConfig.displayFlavor})';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AppPanel(
        config: widget.config,
        auth: widget.auth,
        subTab: _subTab,
        onSubTab: (tab) => setState(() => _subTab = tab),
      ),
    );
  }
}
