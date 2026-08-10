import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/pairing_payload.dart';
import '../../sync/user_messages.dart';

/// Scan desktop QR or paste the pairing JSON to import wrapped master key + cloud URL.
///
/// When the camera is missing (Simulator) or scanning fails, the UI switches to
/// paste-first — never leave the user staring at a dead viewfinder.
class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen>
    with WidgetsBindingObserver {
  bool _done = false;
  bool _busy = false;
  /// null = still probing scanner; true = live preview; false = paste-only.
  bool? _scannerOk;
  String? _error;
  bool _accountMismatch = false;
  final _pasteController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pasteController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _probeClipboardPrefill(force: true);
    }
  }

  void _disableScanner() {
    if (!mounted || _scannerOk == false) return;
    setState(() => _scannerOk = false);
    _probeClipboardPrefill();
  }

  Future<void> _probeClipboardPrefill({bool force = false}) async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final raw = data?.text ?? '';
    if (tryParsePairingPayload(raw) is! PairingParseOk || !mounted) return;
    if (!force && _pasteController.text.trim().isNotEmpty) return;
    if (_pasteController.text.trim() == raw.trim()) return;
    setState(() => _pasteController.text = raw.trim());
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
      _pasteController.text = raw;
      _error = null;
    });
  }

  Future<void> _applyRaw(String raw) async {
    if (_done || _busy) return;
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
          _accountMismatch = fail == PairingParseFailure.accountMismatch;
        });
        return;
      }
      _accountMismatch = false;
      try {
        await widget.config.registerDeviceIfNeeded();
      } catch (_) {
        // Pairing succeeded; parent setup step may surface register soft-fail.
      }
      if (!mounted) return;
      setState(() {
        _done = true;
        _busy = false;
        _error = null;
      });
      Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = SyncUserMessages.invalidPairingQr;
        });
      }
    }
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_done || _busy) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null || raw.isEmpty) return;
    if (_scannerOk != true) {
      setState(() => _scannerOk = true);
    }
    await _applyRaw(raw);
  }

  Future<void> _onConnect() async {
    final raw = _pasteController.text.trim();
    if (raw.isEmpty) {
      setState(() => _error = SyncUserMessages.clipboardEmpty);
      return;
    }
    await _applyRaw(raw);
  }

  Widget _pastePanel({required bool primary}) {
    final canConnect =
        _pasteController.text.trim().isNotEmpty && !_busy && !_done;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          primary
              ? SyncUserMessages.pastePairingPrimaryHint
              : SyncUserMessages.pastePairingHint,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: ExoSpacing.sm),
        TextField(
          controller: _pasteController,
          minLines: 3,
          maxLines: 6,
          enabled: !_busy && !_done,
          autofocus: primary,
          smartQuotesType: SmartQuotesType.disabled,
          smartDashesType: SmartDashesType.disabled,
          enableSuggestions: false,
          autocorrect: false,
          keyboardType: TextInputType.visiblePassword,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            hintText: SyncUserMessages.pastePairingFieldHint,
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        const SizedBox(height: ExoSpacing.sm),
        TextButton(
          onPressed: (_busy || _done) ? null : _pasteFromClipboard,
          child: const Text(SyncUserMessages.pasteFromClipboard),
        ),
        const SizedBox(height: ExoSpacing.md),
        ExoPrimaryButton(
          label: SyncUserMessages.connectPairing,
          busy: _busy,
          onPressed: canConnect ? _onConnect : null,
        ),
      ],
    );
  }

  Widget _scannerPane() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: ColoredBox(
        color: const Color(0xFF000000),
        child: MobileScanner(
          onDetect: _onDetect,
          errorBuilder: (context, error, child) {
            WidgetsBinding.instance.addPostFrameCallback((_) => _disableScanner());
            // Avoid the default "Scanning is not supported" dead-end chrome.
            return const SizedBox.expand();
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pasteOnly = _scannerOk == false;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          pasteOnly ? SyncUserMessages.pairPasteTitle : 'Pair with desktop',
        ),
      ),
      body: pasteOnly
          ? ListView(
              padding: const EdgeInsets.all(ExoSpacing.lg),
              children: [
                Text(
                  SyncUserMessages.pairStepSubtitleNoCamera,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (_error != null) ...[
                  const SizedBox(height: ExoSpacing.md),
                  ExoSyncStatusBanner(message: _error!, isError: true),
                  if (_accountMismatch) ...[
                    const SizedBox(height: ExoSpacing.sm),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              await widget.config.clearSession();
                              if (mounted) Navigator.pop(context, false);
                            },
                      child: const Text(SyncUserMessages.signOutSwitchAccount),
                    ),
                  ],
                ],
                const SizedBox(height: ExoSpacing.lg),
                _pastePanel(primary: true),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.all(ExoSpacing.lg),
                  child: Text(
                    SyncUserMessages.pairStepSubtitle,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: ExoSpacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ExoSyncStatusBanner(message: _error!, isError: true),
                        if (_accountMismatch)
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () async {
                                    await widget.config.clearSession();
                                    if (mounted) Navigator.pop(context, false);
                                  },
                            child: const Text(SyncUserMessages.signOutSwitchAccount),
                          ),
                      ],
                    ),
                  ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      ExoSpacing.lg,
                      0,
                      ExoSpacing.lg,
                      ExoSpacing.md,
                    ),
                    child: _scannerPane(),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    ExoSpacing.lg,
                    0,
                    ExoSpacing.lg,
                    ExoSpacing.lg,
                  ),
                  child: _pastePanel(primary: false),
                ),
              ],
            ),
    );
  }
}
