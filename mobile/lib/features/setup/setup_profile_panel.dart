import 'package:flutter/material.dart';

import '../../design/exo_choice_chips.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';
import 'setup_copy.dart';
import 'setup_me.dart';

/// Name-if-blank + one work chip. Continue stays off until both are present.
class SetupProfilePanel extends StatelessWidget {
  const SetupProfilePanel({
    super.key,
    required this.copy,
    required this.showNameFields,
    required this.firstName,
    required this.lastName,
    required this.workRole,
    required this.busy,
    this.error,
    required this.onFirstName,
    required this.onLastName,
    required this.onWorkRole,
    required this.onContinue,
    required this.onSignOut,
  });

  final SetupCopy copy;
  final bool showNameFields;
  final String firstName;
  final String lastName;
  final String? workRole;
  final bool busy;
  final String? error;
  final ValueChanged<String> onFirstName;
  final ValueChanged<String> onLastName;
  final ValueChanged<String> onWorkRole;
  final VoidCallback onContinue;
  final VoidCallback onSignOut;

  bool get canContinue {
    if (workRole == null) return false;
    if (!showNameFields) return true;
    return firstName.trim().isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoMark(),
        const SizedBox(height: ExoSpacing.xxl),
        ExoSectionLabel(copy.profileEyebrow),
        const SizedBox(height: ExoSpacing.sm),
        Text(copy.profileTitle, style: textTheme.headlineSmall),
        if (showNameFields) ...[
          const SizedBox(height: ExoSpacing.xl),
          TextField(
            enabled: !busy,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.givenName],
            decoration: InputDecoration(labelText: copy.firstNameLabel),
            onChanged: onFirstName,
          ),
          const SizedBox(height: ExoSpacing.md),
          TextField(
            enabled: !busy,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.familyName],
            decoration: InputDecoration(labelText: copy.lastNameLabel),
            onChanged: onLastName,
          ),
        ],
        const SizedBox(height: ExoSpacing.xl),
        Text(copy.profileWorkPrompt, style: textTheme.bodyMedium),
        const SizedBox(height: ExoSpacing.md),
        ExoChoiceChips<String>(
          options: [
            for (final role in SetupMeSnapshot.workRoles)
              (role, copy.workRoleLabel(role)),
          ],
          selected: workRole,
          onSelected: busy ? (_) {} : onWorkRole,
        ),
        if (error != null) ...[
          const SizedBox(height: ExoSpacing.lg),
          ExoStatusBanner(kind: ExoStatusKind.error, message: error!),
        ],
        const SizedBox(height: ExoSpacing.xl),
        ExoPrimaryButton(
          label: copy.profileContinue,
          busy: busy,
          onPressed: canContinue && !busy ? onContinue : null,
        ),
        TextButton(
          onPressed: busy ? null : onSignOut,
          child: const Text(SyncUserMessages.signOutSwitchAccount),
        ),
      ],
    );
  }
}
