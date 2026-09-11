import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../calendars/apple_calendar.dart';
import 'setup_copy.dart';
import 'setup_sources_ack.dart';
import 'setup_sources_panel.dart';

/// Loads EventKit status without prompting; Continue always leaves the step.
class SetupSourcesStep extends StatefulWidget {
  SetupSourcesStep({
    super.key,
    required this.ack,
    required this.onAcknowledged,
    required this.onSignOut,
    this.appleCalendar,
    bool? appleSupported,
  }) : appleSupported = appleSupported ?? Platform.isIOS;

  final SetupSourcesAck ack;
  final VoidCallback onAcknowledged;
  final Future<void> Function() onSignOut;
  final AppleCalendar? appleCalendar;
  final bool appleSupported;

  @override
  State<SetupSourcesStep> createState() => _SetupSourcesStepState();
}

class _SetupSourcesStepState extends State<SetupSourcesStep> {
  late final AppleCalendar _apple;
  AppleCalendarSnapshot _snapshot = const AppleCalendarSnapshot(
    status: AppleCalendarStatus.unavailable,
  );
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _apple = widget.appleCalendar ?? DeviceAppleCalendar();
    if (widget.appleSupported) _loadStatus();
  }

  Future<void> _loadStatus() async {
    setState(() => _busy = true);
    final snap = await _apple.current();
    if (!mounted) return;
    setState(() {
      _snapshot = snap;
      _busy = false;
    });
  }

  Future<void> _useApple() async {
    setState(() => _busy = true);
    final snap = await _apple.requestAccess();
    if (!mounted) return;
    setState(() {
      _snapshot = snap;
      _busy = false;
    });
  }

  Future<void> _openSettings() async {
    await launchUrl(Uri.parse('app-settings:'));
  }

  Future<void> _continue() async {
    await widget.ack.mark();
    if (mounted) widget.onAcknowledged();
  }

  @override
  Widget build(BuildContext context) {
    return SetupSourcesPanel(
      copy: SetupCopy.of(context),
      appleSupported: widget.appleSupported,
      apple: _snapshot,
      appleBusy: _busy,
      onUseApple: _useApple,
      onOpenSettings: _openSettings,
      onContinue: _continue,
      onSignOut: () => widget.onSignOut(),
    );
  }
}
