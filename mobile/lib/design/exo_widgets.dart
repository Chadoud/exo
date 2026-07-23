import 'package:flutter/material.dart';

import 'exo_colors.dart';
import 'exo_cube_svg.dart';
import 'exo_spacing.dart';
import 'exo_theme.dart';

/// Compact wordmark — SVG cube + EXO (boot draw uses [ExoCubeIntro] instead).
class ExoMark extends StatelessWidget {
  const ExoMark({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final cubeSize = compact ? 34.0 : 44.0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExoCubeSvg(size: cubeSize),
        SizedBox(width: compact ? ExoSpacing.sm : ExoSpacing.md),
        Text(
          'EXO',
          style: TextStyle(
            fontSize: compact ? 16 : 20,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
            color: ExoColors.textPrimary,
          ),
        ),
      ],
    );
  }
}

/// Section eyebrow label.
class ExoSectionLabel extends StatelessWidget {
  const ExoSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: ExoColors.textMuted,
            letterSpacing: 0.8,
          ),
    );
  }
}

/// Flat surface panel with hairline border.
class ExoSurface extends StatelessWidget {
  const ExoSurface({
    super.key,
    required this.child,
    this.padding,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: ExoColors.bgElevated,
        borderRadius: BorderRadius.circular(ExoTheme.radius),
        border: Border.all(color: ExoColors.border),
      ),
      child: Padding(
        padding: padding ?? const EdgeInsets.all(ExoSpacing.lg),
        child: child,
      ),
    );
  }
}

/// Branded card container (alias for [ExoSurface]).
class ExoCard extends StatelessWidget {
  const ExoCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return ExoSurface(padding: padding, child: child);
  }
}

/// Primary CTA with minimum touch target.
class ExoPrimaryButton extends StatelessWidget {
  const ExoPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: ExoColors.textPrimary),
            )
          : Text(label),
    );
  }
}

/// Secondary outlined CTA.
class ExoSecondaryButton extends StatelessWidget {
  const ExoSecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final child = busy
        ? const SizedBox(
            height: 18,
            width: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Text(label);
    if (icon == null || busy) {
      return OutlinedButton(onPressed: busy ? null : onPressed, child: child);
    }
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 20),
      label: Text(label),
    );
  }
}

/// Plain-language sync / status banner.
class ExoSyncStatusBanner extends StatelessWidget {
  const ExoSyncStatusBanner({super.key, required this.message, this.isError = false});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(ExoSpacing.md),
      decoration: BoxDecoration(
        color: isError ? ExoColors.errorSoft : ExoColors.bgElevated,
        borderRadius: BorderRadius.circular(ExoTheme.radius),
        border: Border.all(color: isError ? ExoColors.error.withValues(alpha: 0.45) : ExoColors.border),
      ),
      child: Text(message, style: Theme.of(context).textTheme.bodyMedium),
    );
  }
}

/// Empty state with one clear next action.
class ExoEmptyState extends StatelessWidget {
  const ExoEmptyState({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: ExoSpacing.contentMaxWidth),
        child: Padding(
          padding: const EdgeInsets.all(ExoSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: ExoColors.bgElevated,
                  borderRadius: BorderRadius.circular(ExoTheme.radius),
                  border: Border.all(color: ExoColors.border),
                ),
                child: Icon(icon, size: 26, color: ExoColors.textMuted),
              ),
              const SizedBox(height: ExoSpacing.lg),
              Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: ExoSpacing.sm),
              Text(subtitle, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: ExoSpacing.lg),
                ExoPrimaryButton(label: actionLabel!, onPressed: onAction),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Centers content on wide screens.
class ExoContentWidth extends StatelessWidget {
  const ExoContentWidth({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: ExoSpacing.contentMaxWidth),
        child: child,
      ),
    );
  }
}
