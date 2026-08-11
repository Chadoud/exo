import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/exo_config.dart';
import '../../app/mobile_sync_config.dart';
import '../../sync/pairing_payload.dart';
import '../../sync/user_messages.dart';
import '../settings/pairing_screen.dart';
import 'setup_link_panel.dart';

/// Orchestrates setup step 2: clipboard probe (no auto-apply), Connect, Scan modal.
class SetupLinkStep extends StatefulWidget {
  const SetupLinkStep({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<SetupLinkStep> createState() => _SetupLinkStepState();
}

class _SetupLinkStepState extends State<SetupLinkStep>
    with WidgetsBindingObserver {
  String _clipboardPairingText = '';
  bool _clipboardReady = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _probeClipboard());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _probeClipboard();
    }
  }

  Future<void> _probeClipboard() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final raw = data?.text ?? '';
    final parsed = tryParsePairingPayload(raw);
    if (!mounted) return;
    if (parsed is PairingParseOk) {
      setState(() {
        _clipboardPairingText = raw.trim();
        _clipboardReady = true;
      });
    } else {
      setState(() => _clipboardReady = false);
    }
  }

  Future<void> _pasteFromClipboard() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final raw = (data?.text ?? '').trim();
    if (!mounted) return;
    if (raw.isEmpty) {
      setState(() => _error = SyncUserMessages.clipboardEmpty);
      return;
    }
    setState(() {
      _clipboardPairingText = raw;
      _clipboardReady = tryParsePairingPayload(raw) is PairingParseOk;
      _error = null;
    });
  }

  Future<void> _afterPaired() async {
    try {
      await widget.config.registerDeviceIfNeeded();
    } catch (_) {
      if (mounted) {
        setState(() => _error = SyncUserMessages.pairingRegisterFailed);
      }
    }
    if (mounted) setState(() {});
  }

  Future<void> _onConnect(String raw) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final fail = await applyPairingRaw(widget.config, raw);
      if (!mounted) return;
      if (fail != null) {
        setState(() {
          _busy = false;
          _error = messageForPairingParseFailure(fail);
        });
        return;
      }
      await _afterPaired();
      if (mounted) setState(() => _busy = false);
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = SyncUserMessages.invalidPairingQr;
        });
      }
    }
  }

  Future<void> _onScan() async {
    final paired = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PairingScreen(config: widget.config)),
    );
    if (paired == true && mounted) {
      await _afterPaired();
    }
  }

  Future<void> _skipPairDev() async {
    await widget.config.completeOnboardingSkippingPair();
  }

  Future<void> _signOutSwitchAccount() async {
    await widget.config.clearSession();
    if (mounted) {
      setState(() => _error = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SetupLinkPanel(
      initialPasteText: _clipboardPairingText,
      clipboardReady: _clipboardReady,
      busy: _busy,
      error: _error,
      onConnect: _onConnect,
      onScan: _onScan,
      onPasteFromClipboard: _pasteFromClipboard,
      onSkipDev: ExoConfig.allowDevSkipPair ? _skipPairDev : null,
      onSignOut: _signOutSwitchAccount,
    );
  }
}
