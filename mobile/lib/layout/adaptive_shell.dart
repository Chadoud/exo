import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/mobile_sync_config.dart';
import '../design/exo_colors.dart';
import '../features/auth/mobile_auth_service.dart';
import '../features/memory/memory_screen.dart';
import '../features/settings/pairing_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/tasks/tasks_screen.dart';
import '../sync/user_messages.dart';
import 'window_size.dart';

/// Shell destinations — Capture is never a tab.
enum ShellTab { memory, tasks }

class _TabSpec {
  const _TabSpec({
    required this.id,
    required this.label,
    required this.title,
    required this.icon,
    required this.selectedIcon,
  });

  final ShellTab id;
  final String label;
  final String title;
  final IconData icon;
  final IconData selectedIcon;
}

/// Adaptive navigation: Memory (default) + Tasks.
class AdaptiveShell extends StatefulWidget {
  const AdaptiveShell({
    super.key,
    required this.config,
    this.auth,
    this.initialTab = ShellTab.memory,
  });

  final MobileSyncConfig config;
  final MobileAuthService? auth;
  final ShellTab initialTab;

  static const _tabs = <_TabSpec>[
    _TabSpec(
      id: ShellTab.memory,
      label: 'Memory',
      title: SyncUserMessages.memoriesTitle,
      icon: Icons.psychology_outlined,
      selectedIcon: Icons.psychology,
    ),
    _TabSpec(
      id: ShellTab.tasks,
      label: SyncUserMessages.tasksTitle,
      title: SyncUserMessages.tasksTitle,
      icon: Icons.task_alt_outlined,
      selectedIcon: Icons.task_alt,
    ),
  ];

  /// Tab labels for tests / docs — Capture must not appear.
  static List<String> get tabLabels => [for (final t in _tabs) t.label];

  @override
  State<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends State<AdaptiveShell> {
  late ShellTab _tab = widget.initialTab;
  bool _didAutoPull = false;

  int get _tabIndex {
    final i = AdaptiveShell._tabs.indexWhere((t) => t.id == _tab);
    return i < 0 ? 0 : i;
  }

  _TabSpec get _current => AdaptiveShell._tabs[_tabIndex];

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoPullOnce());
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    super.dispose();
  }

  void _onConfig() {
    if (mounted) setState(() {});
  }

  /// One pull when a paired session enters the shell — no AppBar-only surprise empty.
  Future<void> _autoPullOnce() async {
    if (!mounted || _didAutoPull) return;
    if (!widget.config.isConfigured) return;
    _didAutoPull = true;
    await _sync();
  }

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SettingsScreen(config: widget.config, auth: widget.auth),
      ),
    );
  }

  Future<void> _signInAgain() async {
    final auth = widget.auth;
    if (auth == null) return;
    try {
      await launchUrl(auth.googleSignInUri(), mode: LaunchMode.externalApplication);
    } catch (_) {
      _snack(SyncUserMessages.signInFailed);
    }
  }

  Future<void> _pairAgain() async {
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

  Future<void> _sync() async {
    if (widget.config.syncInFlight) return;
    try {
      await widget.config.syncNow();
    } catch (_) {
      // [MobileSyncConfig.lastError] drives tab banners; snack is redundant.
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Widget _bodyFor(ShellTab tab) {
    switch (tab) {
      case ShellTab.memory:
        return MemoryScreen(
          config: widget.config,
          onSignInAgain: _signInAgain,
          onPairAgain: _pairAgain,
        );
      case ShellTab.tasks:
        return TasksScreen(
          config: widget.config,
          onSignInAgain: _signInAgain,
          onPairAgain: _pairAgain,
        );
    }
  }

  List<Widget> _appBarActions() {
    final busy = widget.config.syncInFlight;
    return [
      IconButton(
        icon: busy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.sync, size: 22),
        onPressed: busy ? null : _sync,
        tooltip: SyncUserMessages.syncNow,
      ),
      IconButton(
        icon: const Icon(Icons.settings_outlined, size: 22),
        onPressed: _openSettings,
        tooltip: 'Settings',
      ),
    ];
  }

  void _selectIndex(int i) {
    if (i < 0 || i >= AdaptiveShell._tabs.length) return;
    setState(() => _tab = AdaptiveShell._tabs[i].id);
  }

  @override
  Widget build(BuildContext context) {
    final useRail = exoUseNavigationRail(context);
    final body = _bodyFor(_tab);
    const tabs = AdaptiveShell._tabs;

    return Scaffold(
      appBar: AppBar(
        title: Text(_current.title),
        actions: _appBarActions(),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1),
        ),
      ),
      body: useRail
          ? Row(
              children: [
                NavigationRail(
                  selectedIndex: _tabIndex,
                  onDestinationSelected: _selectIndex,
                  destinations: [
                    for (final t in tabs)
                      NavigationRailDestination(
                        icon: Icon(t.icon),
                        selectedIcon: Icon(t.selectedIcon),
                        label: Text(t.label),
                      ),
                  ],
                ),
                const VerticalDivider(width: 1),
                Expanded(child: body),
              ],
            )
          : body,
      bottomNavigationBar: useRail
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Divider(height: 1),
                NavigationBar(
                  selectedIndex: _tabIndex,
                  onDestinationSelected: _selectIndex,
                  destinations: [
                    for (final t in tabs)
                      NavigationDestination(
                        icon: Icon(t.icon),
                        selectedIcon: Icon(t.selectedIcon, color: ExoColors.brandPrimary),
                        label: t.label,
                      ),
                  ],
                ),
              ],
            ),
    );
  }
}
