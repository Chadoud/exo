import 'package:flutter/foundation.dart';

/// Build-time and runtime configuration (flavors via --dart-define).
abstract final class ExoConfig {
  /// Keep in sync with `pubspec.yaml` version (name part before +build).
  static const appVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '0.2.0',
  );

  static const cloudUrl = String.fromEnvironment(
    'EXOSITES_CLOUD_URL',
    defaultValue: 'https://api.exosites.ch',
  );

  static const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'production');

  static const privacyPolicyUrl = String.fromEnvironment(
    'PRIVACY_POLICY_URL',
    defaultValue: 'https://exosites.ch/eng/app-privacy',
  );

  static const termsOfServiceUrl = String.fromEnvironment(
    'TERMS_OF_SERVICE_URL',
    defaultValue: 'https://exosites.ch/eng/app-terms',
  );

  /// Explicit opt-in for profile/release staging builds (e.g. internal IPA).
  static const _devSkipPairDefine = bool.fromEnvironment(
    'EXOSITES_DEV_SKIP_PAIR',
    defaultValue: false,
  );

  static bool get isStaging => flavor == 'staging';

  static String get displayFlavor => isStaging ? 'Staging' : '';

  /// Allow entering the app shell after sign-in without desktop pairing.
  ///
  /// On by default in **debug** (`flutter run`). Never in production **release**
  /// (TestFlight / store). Opt in elsewhere with `--dart-define=EXOSITES_DEV_SKIP_PAIR=true`.
  static bool get allowDevSkipPair {
    if (kReleaseMode && flavor == 'production') return false;
    return kDebugMode || _devSkipPairDefine;
  }
}
