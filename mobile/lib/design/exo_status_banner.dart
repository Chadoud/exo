import 'package:flutter/material.dart';

import 'exo_palette.dart';
import 'exo_spacing.dart';
import 'exo_theme.dart';

/// Shared sync / session status with optional single CTA.
enum ExoStatusKind {
  ready,
  syncing,
  needsSignIn,
  needsPair,
  authExpired,
  networkError,
  decryptError,
  info,
  error,
}

class ExoStatusBanner extends StatelessWidget {
  const ExoStatusBanner({
    super.key,
    required this.message,
    this.kind = ExoStatusKind.info,
    this.actionLabel,
    this.onAction,
    this.busy = false,
  });

  final String message;
  final ExoStatusKind kind;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool busy;

  bool get _isError =>
      kind == ExoStatusKind.needsSignIn ||
      kind == ExoStatusKind.needsPair ||
      kind == ExoStatusKind.authExpired ||
      kind == ExoStatusKind.networkError ||
      kind == ExoStatusKind.decryptError ||
      kind == ExoStatusKind.error;

  IconData get _icon {
    switch (kind) {
      case ExoStatusKind.syncing:
        return Icons.sync;
      case ExoStatusKind.ready:
        return Icons.check_circle_outline;
      case ExoStatusKind.needsSignIn:
      case ExoStatusKind.authExpired:
        return Icons.lock_outline;
      case ExoStatusKind.needsPair:
        return Icons.qr_code_2_outlined;
      case ExoStatusKind.networkError:
        return Icons.wifi_off_outlined;
      case ExoStatusKind.decryptError:
        return Icons.key_off_outlined;
      case ExoStatusKind.error:
        return Icons.error_outline;
      case ExoStatusKind.info:
        return Icons.info_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = ExoPalette.of(context);
    final error = Theme.of(context).colorScheme.error;
    final bg = _isError ? palette.errorSoft : palette.bgElevated;
    final border = _isError ? error.withValues(alpha: 0.45) : palette.border;
    final iconColor = _isError ? error : palette.textMuted;

    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(ExoSpacing.md),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(ExoTheme.radius),
          border: Border.all(color: border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (kind == ExoStatusKind.syncing || busy)
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                else
                  Icon(_icon, size: 18, color: iconColor),
                const SizedBox(width: ExoSpacing.sm),
                Expanded(
                  child: Text(
                    message,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                  ),
                ),
              ],
            ),
            if (actionLabel != null && onAction != null && !busy) ...[
              const SizedBox(height: ExoSpacing.sm),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: onAction,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 36),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(actionLabel!),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
