import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/exo_config.dart';
import '../../design/exo_segmented_tab_bar.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';
import 'setup_portal_header.dart';

/// OAuth providers offered on the sign-in portal.
enum SignInProvider { google, apple }

enum _EmailMode { signIn, createAccount }

/// Sign-in portal — centered hero, card, segmented email mode, social below.
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

  final SignInProvider? launchingProvider;
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
  _EmailMode _emailMode = _EmailMode.signIn;
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

  bool get _createAccount => _emailMode == _EmailMode.createAccount;
  bool get _busy => widget.launchingProvider != null || widget.emailBusy;
  bool get _waitingForBrowser => widget.waitingProvider != null;

  Future<void> _submitEmail() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
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

  Future<void> _openForgotPassword() async {
    final uri = Uri.parse(ExoConfig.forgotPasswordUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
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
        color: isGoogle ? null : Theme.of(context).colorScheme.onSurface,
      ),
      busy: widget.launchingProvider == provider,
      onPressed: _busy ? null : () => widget.onProviderSignIn(provider),
    );
  }

  Widget _waitingCard(SignInProvider waiting) {
    return ExoSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ExoStatusBanner(
            kind: ExoStatusKind.info,
            message: SyncUserMessages.waitingForBrowser,
            actionLabel: SyncUserMessages.openSignInAgain,
            onAction: () => widget.onProviderSignIn(waiting),
          ),
        ],
      ),
    );
  }

  Widget _emailCard() {
    final appleFirst = defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS;
    final providers = appleFirst
        ? const [SignInProvider.apple, SignInProvider.google]
        : const [SignInProvider.google, SignInProvider.apple];
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return ExoSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ExoSegmentedTabBar<_EmailMode>(
            semanticsLabel: SyncUserMessages.emailModeTabsAria,
            enabled: !_busy,
            selected: _emailMode,
            onSelected: (mode) => setState(() => _emailMode = mode),
            tabs: const [
              (_EmailMode.signIn, SyncUserMessages.signInTab),
              (_EmailMode.createAccount, SyncUserMessages.createAccountTab),
            ],
          ),
          const SizedBox(height: ExoSpacing.lg),
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
                    scrollPadding: const EdgeInsets.only(bottom: ExoSpacing.xxl * 4),
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
                      suffixIcon: SizedBox(
                        width: 48,
                        height: 48,
                        child: IconButton(
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
                  ),
                  if (!_createAccount) ...[
                    const SizedBox(height: ExoSpacing.xs),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _busy ? null : _openForgotPassword,
                        child: const Text(SyncUserMessages.forgotPassword),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.only(bottom: bottomInset > 0 ? ExoSpacing.sm : 0),
            child: ExoPrimaryButton(
              label: _createAccount
                  ? SyncUserMessages.createAccount
                  : SyncUserMessages.signIn,
              busy: widget.emailBusy,
              onPressed: _busy ? null : _submitEmail,
            ),
          ),
          const SizedBox(height: ExoSpacing.lg),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: ExoSpacing.md),
                child: Text(
                  SyncUserMessages.orContinueWith,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              const Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: ExoSpacing.lg),
          _providerButton(providers[0]),
          const SizedBox(height: ExoSpacing.sm),
          _providerButton(providers[1]),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final waiting = widget.waitingProvider;
    final title = _waitingForBrowser
        ? SyncUserMessages.setupTitle
        : _createAccount
            ? SyncUserMessages.setupTitleCreate
            : SyncUserMessages.setupTitle;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SetupPortalHeader(
          stepLabel: SyncUserMessages.stepSignIn,
          title: title,
          subtitle: SyncUserMessages.setupSubtitle,
        ),
        const SizedBox(height: ExoSpacing.xl),
        if (widget.error != null) ...[
          Semantics(
            liveRegion: true,
            child: ExoStatusBanner(
              kind: ExoStatusKind.error,
              message: widget.error!,
            ),
          ),
          const SizedBox(height: ExoSpacing.lg),
        ],
        if (waiting != null)
          _waitingCard(waiting)
        else
          _emailCard(),
      ],
    );
  }
}
