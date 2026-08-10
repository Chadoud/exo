import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';

/// Sign-in: email/password first (normal login), then Apple / Google.
class SetupSignInPanel extends StatefulWidget {
  const SetupSignInPanel({
    super.key,
    required this.launchingBrowser,
    required this.waitingBrowser,
    required this.emailBusy,
    required this.error,
    required this.onGoogle,
    required this.onApple,
    required this.onEmailLogin,
    required this.onEmailRegister,
  });

  final bool launchingBrowser;
  final bool waitingBrowser;
  final bool emailBusy;
  final String? error;
  final VoidCallback onGoogle;
  final VoidCallback onApple;
  final Future<void> Function(String email, String password) onEmailLogin;
  final Future<void> Function(String email, String password) onEmailRegister;

  @override
  State<SetupSignInPanel> createState() => _SetupSignInPanelState();
}

class _SetupSignInPanelState extends State<SetupSignInPanel> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _createAccount = false;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submitEmail() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) return;
    if (_createAccount) {
      await widget.onEmailRegister(email, password);
    } else {
      await widget.onEmailLogin(email, password);
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = widget.launchingBrowser || widget.emailBusy;
    final textTheme = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoMark(),
        const SizedBox(height: ExoSpacing.xl),
        Text(
          _createAccount ? SyncUserMessages.setupTitleCreate : SyncUserMessages.setupTitle,
          style: textTheme.headlineSmall,
        ),
        const SizedBox(height: ExoSpacing.sm),
        Text(SyncUserMessages.setupSubtitle, style: textTheme.bodyMedium),
        const SizedBox(height: ExoSpacing.sm),
        Text(
          SyncUserMessages.setupPairingHint,
          style: textTheme.bodySmall?.copyWith(color: ExoColors.textMuted),
        ),
        const SizedBox(height: ExoSpacing.xl),
        if (widget.waitingBrowser) ...[
          ExoStatusBanner(
            kind: ExoStatusKind.info,
            message: SyncUserMessages.waitingForGoogle,
            actionLabel: SyncUserMessages.openSignInAgain,
            onAction: widget.onGoogle,
          ),
          const SizedBox(height: ExoSpacing.lg),
        ],
        if (widget.error != null) ...[
          ExoStatusBanner(
            kind: ExoStatusKind.error,
            message: widget.error!,
          ),
          const SizedBox(height: ExoSpacing.lg),
        ],
        // Primary: email + password (standard login portal).
        TextField(
          controller: _email,
          enabled: !busy,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autocorrect: false,
          autofillHints: const [AutofillHints.email, AutofillHints.username],
          onSubmitted: (_) => _passwordFocus.requestFocus(),
          decoration: const InputDecoration(
            labelText: SyncUserMessages.emailLabel,
            prefixIcon: Icon(Icons.mail_outline, size: 20),
          ),
        ),
        const SizedBox(height: ExoSpacing.md),
        TextField(
          controller: _password,
          focusNode: _passwordFocus,
          enabled: !busy,
          obscureText: _obscure,
          textInputAction: TextInputAction.done,
          autofillHints: _createAccount
              ? const [AutofillHints.newPassword]
              : const [AutofillHints.password],
          onSubmitted: (_) => _submitEmail(),
          decoration: InputDecoration(
            labelText: SyncUserMessages.passwordLabel,
            prefixIcon: const Icon(Icons.lock_outline, size: 20),
            suffixIcon: IconButton(
              tooltip: _obscure ? 'Show password' : 'Hide password',
              icon: Icon(
                _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                size: 20,
              ),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
        ),
        const SizedBox(height: ExoSpacing.lg),
        ExoPrimaryButton(
          label: _createAccount ? SyncUserMessages.createAccount : SyncUserMessages.signIn,
          busy: widget.emailBusy,
          onPressed: busy ? null : _submitEmail,
        ),
        TextButton(
          onPressed: busy ? null : () => setState(() => _createAccount = !_createAccount),
          child: Text(
            _createAccount
                ? SyncUserMessages.haveAccountSignIn
                : SyncUserMessages.noAccountCreate,
          ),
        ),
        const SizedBox(height: ExoSpacing.md),
        Row(
          children: [
            const Expanded(child: Divider()),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: ExoSpacing.md),
              child: Text(
                SyncUserMessages.orContinueWith,
                style: textTheme.bodySmall,
              ),
            ),
            const Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: ExoSpacing.lg),
        // Secondary: social — stacked full-width (matches desktop CloudAuthScreen).
        ExoSecondaryButton(
          label: SyncUserMessages.signInWithGoogle,
          leading: Image.asset(
            'assets/brands/google-sign-in.png',
            width: 20,
            height: 20,
            filterQuality: FilterQuality.medium,
          ),
          busy: widget.launchingBrowser,
          onPressed: busy ? null : widget.onGoogle,
        ),
        const SizedBox(height: ExoSpacing.sm),
        ExoSecondaryButton(
          label: SyncUserMessages.signInWithApple,
          leading: Image.asset(
            'assets/brands/apple-sign-in.png',
            width: 20,
            height: 20,
            filterQuality: FilterQuality.medium,
          ),
          busy: widget.launchingBrowser,
          onPressed: busy ? null : widget.onApple,
        ),
        const SizedBox(height: ExoSpacing.xl),
        Text(
          SyncUserMessages.stepSignIn,
          style: textTheme.bodySmall?.copyWith(color: ExoColors.textMuted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
