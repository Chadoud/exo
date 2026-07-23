import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';
import '../../app/mobile_sync_config.dart';

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

class _PairingScreenState extends State<PairingScreen> {
  bool _done = false;
  bool _busy = false;
  /// null = still probing scanner; true = live preview; false = paste-only.
  bool? _scannerOk;
  String? _error;
  final _pasteController = TextEditingController();

  @override
  void dispose() {
    _pasteController.dispose();
    super.dispose();
  }

  void _disableScanner() {
    if (!mounted || _scannerOk == false) return;
    setState(() => _scannerOk = false);
  }

  Future<void> _applyRaw(String raw) async {
    if (_done || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final payload = jsonDecode(raw.trim()) as Map<String, dynamic>;
      if (payload['v'] != 1) {
        throw const FormatException('Unsupported pairing version');
      }
      await widget.config.applyPairingPayload(payload);
      if (mounted) {
        setState(() {
          _done = true;
          _busy = false;
          _error = null;
        });
        Navigator.pop(context, true);
      }
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

  Future<void> _pasteFromClipboard() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final raw = data?.text?.trim() ?? '';
    if (raw.isEmpty) {
      if (mounted) setState(() => _error = SyncUserMessages.clipboardEmpty);
      return;
    }
    _pasteController.text = raw;
    await _applyRaw(raw);
  }

  Future<void> _pasteFromField() async {
    final raw = _pasteController.text.trim();
    if (raw.isEmpty) {
      setState(() => _error = SyncUserMessages.clipboardEmpty);
      return;
    }
    await _applyRaw(raw);
  }

  Widget _pastePanel({required bool primary}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          primary ? SyncUserMessages.pastePairingPrimaryHint : SyncUserMessages.pastePairingHint,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: ExoSpacing.sm),
        TextField(
          controller: _pasteController,
          minLines: 3,
          maxLines: 6,
          enabled: !_busy && !_done,
          autofocus: primary,
          decoration: const InputDecoration(
            hintText: SyncUserMessages.pastePairingFieldHint,
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        const SizedBox(height: ExoSpacing.md),
        ExoPrimaryButton(
          label: SyncUserMessages.pasteFromClipboard,
          onPressed: (_busy || _done) ? null : _pasteFromClipboard,
        ),
        const SizedBox(height: ExoSpacing.sm),
        OutlinedButton(
          onPressed: (_busy || _done) ? null : _pasteFromField,
          child: const Text(SyncUserMessages.usePastedCode),
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
      appBar: AppBar(title: Text(pasteOnly ? SyncUserMessages.pairPasteTitle : 'Pair with desktop')),
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
                    child: ExoSyncStatusBanner(message: _error!, isError: true),
                  ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, 0, ExoSpacing.lg, ExoSpacing.md),
                    child: _scannerPane(),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, 0, ExoSpacing.lg, ExoSpacing.lg),
                  child: _pastePanel(primary: false),
                ),
              ],
            ),
    );
  }
}
