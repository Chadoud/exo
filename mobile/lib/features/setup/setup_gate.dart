import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/exo_config.dart';
import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/sync_errors.dart';
import '../../sync/user_messages.dart';
import '../auth/mobile_auth_service.dart';
import '../settings/pairing_screen.dart';
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
  bool _launchingBrowser = false;
  bool _waitingBrowser = false;
  bool _emailBusy = false;
  String? _signInError;
  bool _syncing = false;
  String? _syncError;
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
      setState(() {
        _waitingBrowser = false;
        _launchingBrowser = false;
        _emailBusy = false;
        _signInError = null;
        _wasSignedIn = true;
      });
    } else if (mounted) {
      setState(() {});
    }
  }

  void _onAuthError() {
    final msg = widget.auth.lastError.value;
    if (msg == null || !mounted) return;
    setState(() {
      _waitingBrowser = false;
      _launchingBrowser = false;
      _emailBusy = false;
      _signInError = SyncUserMessages.signInFailed;
    });
  }

  Future<void> _launchOAuth(Uri uri) async {
    setState(() {
      _launchingBrowser = true;
      _signInError = null;
    });
    try {
      final reachable = await widget.auth.cloudReachable();
      if (!reachable) {
        if (mounted) {
          setState(() {
            _launchingBrowser = false;
            _waitingBrowser = false;
            _signInError = SyncUserMessages.cloudUnreachable;
          });
        }
        return;
      }
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) throw Exception('launch failed');
      if (mounted) {
        setState(() {
          _launchingBrowser = false;
          _waitingBrowser = true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _launchingBrowser = false;
          _waitingBrowser = false;
          _signInError = SyncUserMessages.signInFailed;
        });
      }
    }
  }

  Future<void> _signInGoogle() => _launchOAuth(widget.auth.googleSignInUri());

  Future<void> _signInApple() => _launchOAuth(widget.auth.appleSignInUri());

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

  Future<void> _emailRegister(String email, String password) async {
    setState(() {
      _emailBusy = true;
      _signInError = null;
    });
    try {
      await widget.auth.registerWithPassword(email: email, password: password);
    } catch (_) {
      if (mounted) {
        setState(() => _signInError = SyncUserMessages.signInFailed);
      }
    } finally {
      if (mounted) setState(() => _emailBusy = false);
    }
  }

  Future<void> _pair() async {
    final paired = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PairingScreen(config: widget.config)),
    );
    if (paired == true && mounted) {
      try {
        await widget.config.registerDeviceIfNeeded();
      } catch (_) {}
      setState(() {});
    }
  }

  Future<void> _skipPairDev() async {
    await widget.config.completeOnboardingSkippingPair();
  }

  Future<void> _runFirstSync() async {
    setState(() {
      _syncing = true;
      _syncError = null;
    });
    try {
      await widget.config.syncNow();
      await widget.config.completeOnboarding();
    } on SyncAuthException {
      setState(() => _syncError = SyncUserMessages.authExpired);
    } on SyncNetworkException {
      setState(() => _syncError = SyncUserMessages.networkFailed);
    } on SyncDecryptException {
      setState(() => _syncError = SyncUserMessages.decryptFailed);
    } catch (_) {
      setState(() => _syncError = SyncUserMessages.firstSyncFailed);
    } finally {
      if (mounted) setState(() => _syncing = false);
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
        launchingBrowser: _launchingBrowser,
        waitingBrowser: _waitingBrowser,
        emailBusy: _emailBusy,
        error: _signInError,
        onGoogle: _signInGoogle,
        onApple: _signInApple,
        onEmailLogin: _emailLogin,
        onEmailRegister: _emailRegister,
      );
    } else if (!cfg.isPaired) {
      body = _PairBody(
        onPair: _pair,
        onSkipDev: ExoConfig.allowDevSkipPair ? _skipPairDev : null,
      );
    } else {
      body = _FirstSyncBody(
        syncing: _syncing,
        error: _syncError,
        onRetry: _runFirstSync,
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

class _PairBody extends StatelessWidget {
  const _PairBody({required this.onPair, this.onSkipDev});

  final VoidCallback onPair;
  final Future<void> Function()? onSkipDev;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ExoMark(),
        const SizedBox(height: ExoSpacing.xxl),
        const ExoSectionLabel(SyncUserMessages.stepPair),
        const SizedBox(height: ExoSpacing.sm),
        Text(SyncUserMessages.pairStepTitle, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: ExoSpacing.sm),
        Text(SyncUserMessages.pairStepSubtitle, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: ExoSpacing.xl),
        ExoSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'On desktop open Settings → Sync → Pair mobile device, then scan the code here.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: ExoSpacing.lg),
              ExoPrimaryButton(label: SyncUserMessages.scanDesktopCode, onPressed: onPair),
              if (onSkipDev != null) ...[
                const SizedBox(height: ExoSpacing.md),
                Text(
                  SyncUserMessages.skipPairingDevHint,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: ExoSpacing.sm),
                OutlinedButton(
                  onPressed: () => onSkipDev!(),
                  child: const Text(SyncUserMessages.skipPairingDev),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _FirstSyncBody extends StatefulWidget {
  const _FirstSyncBody({
    required this.syncing,
    required this.error,
    required this.onRetry,
    required this.onContinue,
    required this.autoStart,
    required this.onAutoStart,
  });

  final bool syncing;
  final String? error;
  final VoidCallback onRetry;
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
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ExoMark(compact: true),
          const SizedBox(height: ExoSpacing.xl),
          ExoStatusBanner(kind: ExoStatusKind.networkError, message: widget.error!),
          const SizedBox(height: ExoSpacing.lg),
          ExoPrimaryButton(label: SyncUserMessages.tryAgain, onPressed: widget.onRetry),
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
