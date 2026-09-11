import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'exo_palette.dart';
import 'exo_spacing.dart';
import 'exo_theme.dart';

/// Two-or-more-way segmented control — matches desktop [SegmentedTabBar].
class ExoSegmentedTabBar<T extends Object> extends StatelessWidget {
  const ExoSegmentedTabBar({
    super.key,
    required this.tabs,
    required this.selected,
    required this.onSelected,
    this.enabled = true,
    this.semanticsLabel,
  });

  final List<(T value, String label)> tabs;
  final T selected;
  final ValueChanged<T> onSelected;
  final bool enabled;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final palette = ExoPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    final selectedIndex = tabs.indexWhere((t) => t.$1 == selected).clamp(0, tabs.length - 1);

    return Semantics(
      label: semanticsLabel,
      child: Focus(
        onKeyEvent: (node, event) {
          if (!enabled || tabs.length < 2) return KeyEventResult.ignored;
          if (event is! KeyDownEvent) return KeyEventResult.ignored;
          final delta = switch (event.logicalKey) {
            LogicalKeyboardKey.arrowRight => 1,
            LogicalKeyboardKey.arrowLeft => -1,
            _ => 0,
          };
          if (delta == 0) return KeyEventResult.ignored;
          final next = (selectedIndex + delta + tabs.length) % tabs.length;
          onSelected(tabs[next].$1);
          return KeyEventResult.handled;
        },
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: palette.well,
            borderRadius: BorderRadius.circular(ExoTheme.radiusInput),
            border: Border.all(color: palette.border),
          ),
          child: Padding(
            padding: const EdgeInsets.all(ExoSpacing.xs),
            child: Row(
              children: [
                for (final tab in tabs)
                  Expanded(
                    child: _Segment(
                      label: tab.$2,
                      selected: tab.$1 == selected,
                      enabled: enabled,
                      selectedColor: scheme.primary,
                      selectedForeground: scheme.onPrimary,
                      mutedForeground: palette.textMuted,
                      onTap: () => onSelected(tab.$1),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.selectedColor,
    required this.selectedForeground,
    required this.mutedForeground,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final Color selectedColor;
  final Color selectedForeground;
  final Color mutedForeground;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          color: selected ? selectedColor : Colors.transparent,
          borderRadius: BorderRadius.circular(7),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? onTap : null,
            borderRadius: BorderRadius.circular(7),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                vertical: ExoSpacing.sm,
                horizontal: ExoSpacing.sm,
              ),
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: selected ? selectedForeground : mutedForeground,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
