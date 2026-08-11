import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';

/// Setup step 2 — paste-primary link phone (Connect). Scan opens [PairingScreen] via parent.
class SetupLinkPanel extends StatefulWidget {
  const SetupLinkPanel({
    super.key,
    this.initialPasteText = '',
    this.clipboardReady = false,
    required this.busy,
    this.error,
    required this.onConnect,
    required this.onScan,
    this.onPasteFromClipboard,
    this.onSkipDev,
    this.onSignOut,
  });

  final String initialPasteText;
  final bool clipboardReady;
  final bool busy;
  final String? error;
  final Future<void> Function(String raw) onConnect;
  final VoidCallback onScan;
  final Future<void> Function()? onPasteFromClipboard;
  final Future<void> Function()? onSkipDev;

  /// Always-visible escape hatch — without it a wrong-account sign-in is a
  /// dead end (nothing is synced yet at this step, so no confirmation needed).
  final Future<void> Function()? onSignOut;

  @override
  State<SetupLinkPanel> createState() => _SetupLinkPanelState();
}

class _SetupLinkPanelState extends State<SetupLinkPanel> {
  late final TextEditingController _pasteController;
  late final VoidCallback _onTextChanged;

  @override
  void initState() {
    super.initState();
    _pasteController = TextEditingController(text: widget.initialPasteText);
    _onTextChanged = () {
      if (mounted) setState(() {});
    };
    _pasteController.addListener(_onTextChanged);
  }

  @override
  void didUpdateWidget(covariant SetupLinkPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Prefill / "Paste from clipboard" — replace field when parent supplies new text.
    if (widget.initialPasteText != oldWidget.initialPasteText &&
        widget.initialPasteText.isNotEmpty &&
        widget.initialPasteText != _pasteController.text) {
      _pasteController.text = widget.initialPasteText;
    }
  }

  @override
  void dispose() {
    _pasteController.removeListener(_onTextChanged);
    _pasteController.dispose();
    super.dispose();
  }

  bool get _canConnect => _pasteController.text.trim().isNotEmpty && !widget.busy;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final subtitle = widget.clipboardReady
        ? SyncUserMessages.pairCodeReady
        : SyncUserMessages.pairStepSubtitle;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoMark(),
        const SizedBox(height: ExoSpacing.xxl),
        const ExoSectionLabel(SyncUserMessages.stepPair),
        const SizedBox(height: ExoSpacing.sm),
        Text(SyncUserMessages.pairStepTitle, style: textTheme.headlineSmall),
        const SizedBox(height: ExoSpacing.sm),
        Text(subtitle, style: textTheme.bodyMedium),
        const SizedBox(height: ExoSpacing.xl),
        if (widget.error != null) ...[
          ExoSyncStatusBanner(message: widget.error!, isError: true),
          const SizedBox(height: ExoSpacing.md),
        ],
        ExoSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _pasteController,
                minLines: 3,
                maxLines: 6,
                enabled: !widget.busy,
                autofocus: true,
                smartQuotesType: SmartQuotesType.disabled,
                smartDashesType: SmartDashesType.disabled,
                enableSuggestions: false,
                autocorrect: false,
                keyboardType: TextInputType.visiblePassword,
                decoration: const InputDecoration(
                  hintText: SyncUserMessages.pastePairingFieldHint,
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              if (widget.onPasteFromClipboard != null) ...[
                const SizedBox(height: ExoSpacing.sm),
                TextButton(
                  onPressed:
                      widget.busy ? null : () => widget.onPasteFromClipboard!(),
                  child: const Text(SyncUserMessages.pasteFromClipboard),
                ),
              ],
              const SizedBox(height: ExoSpacing.md),
              ExoPrimaryButton(
                label: SyncUserMessages.connectPairing,
                busy: widget.busy,
                onPressed: _canConnect
                    ? () => widget.onConnect(_pasteController.text)
                    : null,
              ),
              const SizedBox(height: ExoSpacing.sm),
              OutlinedButton(
                onPressed: widget.busy ? null : widget.onScan,
                child: const Text(SyncUserMessages.scanInstead),
              ),
              if (widget.onSkipDev != null) ...[
                const SizedBox(height: ExoSpacing.md),
                Text(
                  SyncUserMessages.skipPairingDevHint,
                  style: textTheme.bodySmall?.copyWith(color: ExoColors.textMuted),
                ),
                const SizedBox(height: ExoSpacing.sm),
                TextButton(
                  onPressed: widget.busy ? null : () => widget.onSkipDev!(),
                  child: const Text(SyncUserMessages.skipPairingDev),
                ),
              ],
            ],
          ),
        ),
        if (widget.onSignOut != null) ...[
          const SizedBox(height: ExoSpacing.lg),
          TextButton(
            onPressed: widget.busy ? null : () => widget.onSignOut!(),
            child: const Text(SyncUserMessages.signOutSwitchAccount),
          ),
        ],
      ],
    );
  }
}
