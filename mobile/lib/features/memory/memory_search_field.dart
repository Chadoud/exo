import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../sync/user_messages.dart';

/// Persistent Memory search field — owns clear-button visibility from [controller].
class MemorySearchField extends StatelessWidget {
  const MemorySearchField({
    super.key,
    required this.controller,
    required this.onSubmitted,
    required this.onCleared,
  });

  final TextEditingController controller;
  final VoidCallback onSubmitted;
  final VoidCallback onCleared;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, ExoSpacing.md, ExoSpacing.lg, ExoSpacing.sm),
      child: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          return TextField(
            controller: controller,
            textInputAction: TextInputAction.search,
            autofocus: false,
            decoration: InputDecoration(
              labelText: SyncUserMessages.searchMemoriesLabel,
              hintText: SyncUserMessages.searchMemoriesHint,
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: controller.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      tooltip: SyncUserMessages.clearSearch,
                      onPressed: onCleared,
                    ),
            ),
            onSubmitted: (_) => onSubmitted(),
          );
        },
      ),
    );
  }
}
