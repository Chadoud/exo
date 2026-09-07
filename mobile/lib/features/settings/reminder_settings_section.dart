import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../notifications/due_reminder_copy.dart';
import '../../notifications/due_reminder_prefs.dart';
import '../../notifications/due_reminder_scope.dart';

class ReminderSettingsSection extends StatefulWidget {
  const ReminderSettingsSection({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<ReminderSettingsSection> createState() => _ReminderSettingsSectionState();
}

class _ReminderSettingsSectionState extends State<ReminderSettingsSection> {
  bool _enabled = false;
  bool _lockDetail = false;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = DueReminderPrefs(widget.config.storage);
    final enabled = await prefs.enabled;
    final lockDetail = await prefs.lockScreenDetail;
    if (!mounted) return;
    setState(() {
      _enabled = enabled;
      _lockDetail = lockDetail;
      _ready = true;
    });
  }

  Future<void> _setEnabled(bool value) async {
    final copy = DueReminderCopy.of(context);
    final controller = DueReminderScope.maybeOf(context);
    setState(() => _enabled = value);
    if (controller != null) {
      await controller.setEnabled(value, copy);
      return;
    }
    await DueReminderPrefs(widget.config.storage).setEnabled(value);
  }

  Future<void> _setLockDetail(bool value) async {
    final copy = DueReminderCopy.of(context);
    final controller = DueReminderScope.maybeOf(context);
    setState(() => _lockDetail = value);
    if (controller != null) {
      await controller.setLockScreenDetail(value, copy);
      return;
    }
    await DueReminderPrefs(widget.config.storage).setLockScreenDetail(value);
  }

  @override
  Widget build(BuildContext context) {
    final copy = DueReminderCopy.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExoSectionLabel(copy.section),
        const SizedBox(height: ExoSpacing.sm),
        ExoSurface(
          padding: const EdgeInsets.symmetric(vertical: ExoSpacing.sm),
          child: Column(
            children: [
              SwitchListTile(
                title: Text(copy.enableTitle),
                subtitle: Text(copy.enableSubtitle),
                value: _enabled,
                onChanged: _ready ? _setEnabled : null,
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: Text(copy.lockScreenTitle),
                subtitle: Text(copy.lockScreenSubtitle),
                value: _lockDetail,
                onChanged: _ready && _enabled ? _setLockDetail : null,
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  ExoSpacing.lg,
                  0,
                  ExoSpacing.lg,
                  ExoSpacing.sm,
                ),
                child: Text(copy.osOffHint, style: Theme.of(context).textTheme.bodySmall),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
