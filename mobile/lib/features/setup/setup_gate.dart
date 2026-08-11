import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/sync_banner_actions.dart';
import '../../sync/sync_failure.dart';
import '../../sync/user_messages.dart';
import '../auth/mobile_auth_service.dart';
import 'setup_link_step.dart';
import 'setup_sign_in_panel.dart';

/// Full-screen guided setup until sign-in, pair, and first-sync step complete.
class SetupGate extends StatefulWidget {
  const SetupGate({
    super.key,
    required this.config,
    required this.auth,
  });

  final MobileSyncConfig config;
  final MobileAuthService auth;

  @override
  State<SetupGate> createState() => _SetupGateState();
}

class _SetupGateState extends State<SetupGate> {
  SignInProvider? _launchingProvider;
  SignInProvider? _waitingProvider;
  bool _emailBusy = false;
  String? _signInError;
  bool _syncing = false;
  String? _syncError;
  ExoStatusKind _syncErrorKind = ExoStatusKind.error;
  bool _wasSignedIn = false;

  @override
  void initState() {
    super.initState();
    _wasSignedIn = widget.config.isSignedIn;
    widget.config.addListener(_onConfig);
    widget.auth.lastError.addListener(_onAuthError);
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    widget.auth.lastError.removeListener(_onAuthError);
    super.dispose();
  }

  void _onConfig() {
    if (!_wasSignedIn && widget.config.isSignedIn && mounted) {
      // Sign-in succeeded — let iOS offer to save the typed credentials.
      TextInput.finishAutofillContext();
      setState(() {
        _waitingProvider = null;
        _launchingProvider = null;
        _emailBusy = false;
        _signInError = null;
        _wasSignedIn = true;
      });
    } else if (_wasSignedIn && !widget.config.isSignedIn && mounted) {
      setState(() => _wasSignedIn = false);
    } else if (mounted) {
      setState(() {});
    }
  }

  void _onAuthError() {
    final msg = widget.auth.lastError.value;
    if (msg == null || !mounted) return;
    setState(() {
      _waitingProvider = null;
      _launchingProvider = null;
      _emailBusy = false;
      _signInError = SyncUserMessages.signInFailed;
    });
  }

  Future<void> _signInWithProvider(SignInProvider provider) async {
    final uri = provider == SignInProvider.google
        ? widget.auth.googleSignInUri()
        : widget.auth.appleSignInUri();
    setState(() {
      _launchingProvider = provider;
      _signInError = null;
    });
    try {
      final reachable = await widget.auth.cloudReachable();
      if (!reachable) {
        if (mounted) {
          setState(() {
            _launchingProvider = null;
            _waitingProvider = null;
            _signInError = SyncUserMessages.cloudUnreachable;
          });
        }
        return;
      }
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) throw Exception('launch failed');
      if (mounted) {
        setState(() {
          _launchingProvider = null;
          _waitingProvider = provider;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _launchingProvider = null;
          _waitingProvider = null;
          _signInError = SyncUserMessages.signInFailed;
        });
      }
    }
  }

  Future<void> _emailLogin(String email, String password) async {
    setState(() {
      _emailBusy = true;
      _signInError = null;
    });
    try {
      await widget.auth.loginWithPassword(email: email, password: password);
    } catch (_) {
      if (mounted) {
        setState(() => _signInError = SyncUserMessages.invalidEmailPassword);
      }
    } finally {
      if (mounted) setState(() => _emailBusy = false);
    }
  }

  Future<void> _emailRegister({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) async {
    setState(() {
      _emailBusy = true;
      _signInError = null;
    });
    try {
      await widget.auth.registerWithPassword(
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
      );
    } catch (e) {
      if (mounted) {
        setState(() => _signInError = _describeRegisterError(e));
      }
    } finally {
      if (mounted) setState(() => _emailBusy = false);
    }
  }

  /// The cloud returns human-readable `detail` strings we own
  /// (cloud-node/lib/accounts.js) — map the known ones to actionable copy.
  static String _describeRegisterError(Object error) {
    final msg = error.toString().toLowerCase();
    if (msg.contains('already registered')) {
      return SyncUserMessages.emailAlreadyRegistered;
    }
    if (msg.contains('at least 8')) return SyncUserMessages.passwordTooShort;
    return SyncUserMessages.signInFailed;
  }

  Future<void> _runFirstSync() async {
    setState(() {
      _syncing = true;
      _syncError = null;
      _syncErrorKind = ExoStatusKind.error;
    });
    try {
      await widget.config.syncNow();
      await widget.config.completeOnboarding();
    } catch (e) {
      final described = describeSyncFailure(e);
      setState(() {
        _syncError = described.message;
        _syncErrorKind = described.kind;
      });
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _pairAgain() async {
    await widget.config.clearPairing();
    if (mounted) {
      setState(() {
        _syncError = null;
        _syncErrorKind = ExoStatusKind.error;
      });
    }
  }

  Future<void> _continueWithoutSync() async {
    await widget.config.completeOnboarding();
  }

  @override
  Widget build(BuildContext context) {
    final cfg = widget.config;
    final Widget body;
    if (!cfg.isSignedIn) {
      body = SetupSignInPanel(
        launchingProvider: _launchingProvider,
        waitingProvider: _waitingProvider,
        emailBusy: _emailBusy,
        error: _signInError,
        onProviderSignIn: (p) => _signInWithProvider(p),
        onEmailLogin: _emailLogin,
        onEmailRegister: _emailRegister,
      );
    } else if (!cfg.isPaired) {
      body = SetupLinkStep(config: cfg);
    } else {
      body = _FirstSyncBody(
        syncing: _syncing,
        error: _syncError,
        errorKind: _syncErrorKind,
        onRetry: _runFirstSync,
        onPairAgain: _pairAgain,
        onContinue: _continueWithoutSync,
        autoStart: _syncError == null && !_syncing,
        onAutoStart: _runFirstSync,
      );
    }

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            ExoSpacing.lg,
            ExoSpacing.xl,
            ExoSpacing.lg,
            ExoSpacing.xl,
          ),
          child: ExoContentWidth(child: body),
        ),
      ),
    );
  }
}

class _FirstSyncBody extends StatefulWidget {
  const _FirstSyncBody({
    required this.syncing,
    required this.error,
    required this.errorKind,
    required this.onRetry,
    required this.onPairAgain,
    required this.onContinue,
    required this.autoStart,
    required this.onAutoStart,
  });

  final bool syncing;
  final String? error;
  final ExoStatusKind errorKind;
  final VoidCallback onRetry;
  final Future<void> Function() onPairAgain;
  final Future<void> Function() onContinue;
  final bool autoStart;
  final VoidCallback onAutoStart;

  @override
  State<_FirstSyncBody> createState() => _FirstSyncBodyState();
}

class _FirstSyncBodyState extends State<_FirstSyncBody> {
  @override
  void initState() {
    super.initState();
    if (widget.autoStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) => widget.onAutoStart());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.syncing) {
      return Column(
        children: [
          const SizedBox(height: ExoSpacing.xxl),
          const ExoMark(compact: true),
          const SizedBox(height: ExoSpacing.xxl),
          const CircularProgressIndicator(),
          const SizedBox(height: ExoSpacing.lg),
          Text(
            SyncUserMessages.updatingFromDesktop,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      );
    }
    if (widget.error != null) {
      final action = bannerActionFor(widget.errorKind);
      final primaryLabel = action?.$1 ?? SyncUserMessages.tryAgain;
      final primary = action?.$2 == SyncBannerAction.pair
          ? () => widget.onPairAgain()
          : widget.onRetry;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ExoMark(compact: true),
          const SizedBox(height: ExoSpacing.xl),
          ExoStatusBanner(kind: widget.errorKind, message: widget.error!),
          const SizedBox(height: ExoSpacing.lg),
          ExoPrimaryButton(label: primaryLabel, onPressed: primary),
          if (action?.$2 == SyncBannerAction.pair)
            TextButton(
              onPressed: widget.onRetry,
              child: const Text(SyncUserMessages.tryAgain),
            ),
          TextButton(
            onPressed: () => widget.onContinue(),
            child: const Text(SyncUserMessages.continueToMemories),
          ),
        ],
      );
    }
    return const SizedBox.shrink();
  }
}
