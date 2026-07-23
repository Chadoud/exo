import 'package:flutter/material.dart';

import 'app/exo_config.dart';
import 'design/exo_colors.dart';
import 'design/exo_cube_draw.dart';
import 'design/exo_cube_svg.dart';
import 'design/exo_theme.dart';
import 'features/auth/mobile_auth_service.dart';
import 'app/mobile_sync_config.dart';
import 'features/setup/setup_gate.dart';
import 'layout/adaptive_shell.dart';
import 'telemetry/mobile_crash_reporter.dart';

final _crashReporter = MobileCrashReporter();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ExositesMobileApp());
}

/// Flutter mobile — GO SYNC client with adaptive Exo shell.
class ExositesMobileApp extends StatefulWidget {
  const ExositesMobileApp({super.key});

  @override
  State<ExositesMobileApp> createState() => _ExositesMobileAppState();
}

class _ExositesMobileAppState extends State<ExositesMobileApp> {
  final _config = MobileSyncConfig();
  late final MobileAuthService _auth = MobileAuthService(config: _config);
  final _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
  bool _hydrated = false;
  bool _introDone = false;

  @override
  void initState() {
    super.initState();
    _config.hydrate().then((_) {
      _crashReporter.install(optIn: _config.crashReportsOptIn);
      if (mounted) setState(() => _hydrated = true);
    });
    _config.addListener(_onConfigChanged);
    _auth.lastError.addListener(_onAuthError);
    _auth.startListening();
  }

  @override
  void dispose() {
    _config.removeListener(_onConfigChanged);
    _auth.lastError.removeListener(_onAuthError);
    _auth.dispose();
    super.dispose();
  }

  void _onConfigChanged() {
    _crashReporter.setOptIn(_config.crashReportsOptIn);
    if (mounted) setState(() {});
  }

  void _onAuthError() {
    // SetupGate shows inline errors; snackbar only when already in shell.
    if (_config.needsOnboarding) return;
    final msg = _auth.lastError.value;
    if (msg == null || msg.isEmpty) return;
    _scaffoldMessengerKey.currentState?.showSnackBar(SnackBar(content: Text(msg)));
  }

  void _onIntroComplete() {
    if (!mounted || _introDone) return;
    setState(() => _introDone = true);
  }

  Widget _bootHome() {
    // Hold completed cube if hydrate is still running — do not restart the draw.
    if (_introDone) {
      return const Scaffold(
        backgroundColor: ExoColors.bgPrimary,
        body: Center(child: ExoCubeSvg(size: 168)),
      );
    }
    return ExoBootScreen(onIntroComplete: _onIntroComplete);
  }

  @override
  Widget build(BuildContext context) {
    final title = ExoConfig.displayFlavor.isEmpty ? 'Exo' : 'Exo (${ExoConfig.displayFlavor})';
    final ready = _hydrated && _introDone;

    return MaterialApp(
      title: title,
      theme: ExoTheme.dark(),
      scaffoldMessengerKey: _scaffoldMessengerKey,
      home: !ready
          ? _bootHome()
          : ListenableBuilder(
              listenable: _config,
              builder: (context, _) {
                if (_config.needsOnboarding) {
                  return SetupGate(config: _config, auth: _auth);
                }
                return AdaptiveShell(config: _config, auth: _auth);
              },
            ),
    );
  }
}
