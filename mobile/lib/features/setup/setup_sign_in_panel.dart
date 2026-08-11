import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';

/// OAuth providers offered on the sign-in portal.
enum SignInProvider { google, apple }

/// Sign-in: email/password first (normal login), then Apple / Google.
/// Apple is listed first on Apple platforms (App Store guideline 4.8:
/// equal-or-greater prominence when third-party sign-in is offered).
class SetupSignInPanel extends StatefulWidget {
  const SetupSignInPanel({
    super.key,
    required this.launchingProvider,
    required this.waitingProvider,
    required this.emailBusy,
    required this.error,
    required this.onProviderSignIn,
    required this.onEmailLogin,
    required this.onEmailRegister,
  });

  /// Provider whose browser launch is in flight (spinner on that button only).
  final SignInProvider? launchingProvider;

  /// Provider we handed off to the browser for — drives the waiting banner
  /// and its "open again" retry.
  final SignInProvider? waitingProvider;
  final bool emailBusy;
  final String? error;
  final void Function(SignInProvider provider) onProviderSignIn;
  final Future<void> Function(String email, String password) onEmailLogin;
  final Future<void> Function({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) onEmailRegister;

  @override
  State<SetupSignInPanel> createState() => _SetupSignInPanelState();
}

class _SetupSignInPanelState extends State<SetupSignInPanel> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _createAccount = false;
  bool _obscure = true;
  bool _autovalidate = false;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  bool get _busy => widget.launchingProvider != null || widget.emailBusy;

  Future<void> _submitEmail() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      // Keep showing inline errors as the user types corrections.
      setState(() => _autovalidate = true);
      return;
    }
    final email = _email.text.trim();
    final password = _password.text;
    if (_createAccount) {
      await widget.onEmailRegister(
        email: email,
        password: password,
        firstName: _firstName.text,
        lastName: _lastName.text,
      );
    } else {
      await widget.onEmailLogin(email, password);
    }
  }

  String? _validateEmail(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return SyncUserMessages.emailRequired;
    if (!v.contains('@') || v.length < 3) return SyncUserMessages.emailInvalid;
    return null;
  }

  String? _validatePassword(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return SyncUserMessages.passwordRequired;
    // Mirrors the cloud policy (cloud-node/lib/accounts.js) to avoid a
    // guaranteed server rejection on account creation.
    if (_createAccount && v.length < 8) return SyncUserMessages.passwordTooShort;
    return null;
  }

  Widget _nameField(TextEditingController controller, String label,
      String requiredMessage, Iterable<String> autofillHints) {
    return TextFormField(
      controller: controller,
      enabled: !_busy,
      textCapitalization: TextCapitalization.words,
      textInputAction: TextInputAction.next,
      autofillHints: autofillHints,
      validator: (v) =>
          (v == null || v.trim().isEmpty) ? requiredMessage : null,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.person_outline, size: 20),
      ),
    );
  }

  Widget _providerButton(SignInProvider provider) {
    final isGoogle = provider == SignInProvider.google;
    return ExoSecondaryButton(
      label: isGoogle
          ? SyncUserMessages.signInWithGoogle
          : SyncUserMessages.signInWithApple,
      leading: Image.asset(
        isGoogle
            ? 'assets/brands/google-sign-in.png'
            : 'assets/brands/apple-sign-in.png',
        width: 20,
        height: 20,
        filterQuality: FilterQuality.medium,
      ),
      busy: widget.launchingProvider == provider,
      onPressed: _busy ? null : () => widget.onProviderSignIn(provider),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final appleFirst = defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS;
    final providers = appleFirst
        ? const [SignInProvider.apple, SignInProvider.google]
        : const [SignInProvider.google, SignInProvider.apple];
    final waiting = widget.waitingProvider;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoMark(),
        const SizedBox(height: ExoSpacing.xl),
        Text(
          SyncUserMessages.stepSignIn,
          style: textTheme.bodySmall?.copyWith(color: ExoColors.textMuted),
        ),
        const SizedBox(height: ExoSpacing.xs),
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
        if (waiting != null) ...[
          ExoStatusBanner(
            kind: ExoStatusKind.info,
            message: SyncUserMessages.waitingForBrowser,
            actionLabel: SyncUserMessages.openSignInAgain,
            onAction: () => widget.onProviderSignIn(waiting),
          ),
          const SizedBox(height: ExoSpacing.lg),
        ],
        if (widget.error != null) ...[
          // liveRegion: screen readers announce the failure even when the
          // banner appears above the current scroll position.
          Semantics(
            liveRegion: true,
            child: ExoStatusBanner(
              kind: ExoStatusKind.error,
              message: widget.error!,
            ),
          ),
          const SizedBox(height: ExoSpacing.lg),
        ],
        // Primary: email + password (standard login portal).
        Form(
          key: _formKey,
          autovalidateMode: _autovalidate
              ? AutovalidateMode.onUserInteraction
              : AutovalidateMode.disabled,
          child: AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_createAccount) ...[
                  _nameField(
                    _firstName,
                    SyncUserMessages.firstNameLabel,
                    SyncUserMessages.firstNameRequired,
                    const [AutofillHints.givenName],
                  ),
                  const SizedBox(height: ExoSpacing.md),
                  _nameField(
                    _lastName,
                    SyncUserMessages.lastNameLabel,
                    SyncUserMessages.lastNameRequired,
                    const [AutofillHints.familyName],
                  ),
                  const SizedBox(height: ExoSpacing.md),
                ],
                TextFormField(
                  controller: _email,
                  enabled: !_busy,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  autofillHints: const [AutofillHints.email, AutofillHints.username],
                  validator: _validateEmail,
                  onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
                  decoration: const InputDecoration(
                    labelText: SyncUserMessages.emailLabel,
                    prefixIcon: Icon(Icons.mail_outline, size: 20),
                  ),
                ),
                const SizedBox(height: ExoSpacing.md),
                TextFormField(
                  controller: _password,
                  focusNode: _passwordFocus,
                  enabled: !_busy,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  // Keep the CTA below visible when the keyboard opens.
                  scrollPadding: const EdgeInsets.only(bottom: 140),
                  autofillHints: _createAccount
                      ? const [AutofillHints.newPassword]
                      : const [AutofillHints.password],
                  validator: _validatePassword,
                  onFieldSubmitted: (_) => _submitEmail(),
                  decoration: InputDecoration(
                    labelText: SyncUserMessages.passwordLabel,
                    helperText:
                        _createAccount ? SyncUserMessages.passwordMinHint : null,
                    prefixIcon: const Icon(Icons.lock_outline, size: 20),
                    suffixIcon: IconButton(
                      tooltip: _obscure ? 'Show password' : 'Hide password',
                      icon: Icon(
                        _obscure
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 20,
                      ),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: ExoSpacing.lg),
        ExoPrimaryButton(
          label: _createAccount ? SyncUserMessages.createAccount : SyncUserMessages.signIn,
          busy: widget.emailBusy,
          onPressed: _busy ? null : _submitEmail,
        ),
        TextButton(
          onPressed: _busy ? null : () => setState(() => _createAccount = !_createAccount),
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
        _providerButton(providers[0]),
        const SizedBox(height: ExoSpacing.sm),
        _providerButton(providers[1]),
      ],
    );
  }
}
