import 'package:flutter/foundation.dart';

/// Build-time and runtime configuration (flavors via --dart-define).
abstract final class ExoConfig {
  /// Keep in sync with `pubspec.yaml` version (name part before +build).
  static const appVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '0.2.2',
  );

  static const cloudUrl = String.fromEnvironment(
    'EXOSITES_CLOUD_URL',
    defaultValue: 'https://api.exosites.ch',
  );

  /// Password reset page — same host as [cloudUrl], matches desktop portal.
  static String get forgotPasswordUrl => '$cloudUrl/auth/forgot-password/page';

  /// Optional debug FCM/APNs stand-in. Never a production secret.
  static const debugPushToken = String.fromEnvironment(
    'EXOSITES_DEBUG_PUSH_TOKEN',
    defaultValue: '',
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

  /// App Store / Play subscription product. Price always comes from the store.
  static const iapProductId = String.fromEnvironment(
    'EXOSITES_IAP_PRODUCT_ID',
    defaultValue: 'exo.pro.monthly',
  );

  /// Explicit opt-in for profile/release staging builds (e.g. internal IPA).
  static const _devSkipPairDefine = bool.fromEnvironment(
    'EXOSITES_DEV_SKIP_PAIR',
    defaultValue: false,
  );

  static const _devSkipFirstRunDefine = bool.fromEnvironment(
    'EXOSITES_DEV_SKIP_FIRST_RUN',
    defaultValue: false,
  );

  static bool get isStaging => flavor == 'staging';

  static String get displayFlavor => isStaging ? 'Staging' : '';

  /// Shared gate: never on in a production **release** binary (TestFlight / store).
  @visibleForTesting
  static bool resolveDevSkip({
    required bool releaseMode,
    required String flavorName,
    required bool debugMode,
    required bool defineEnabled,
  }) {
    if (releaseMode && flavorName == 'production') return false;
    return debugMode || defineEnabled;
  }

  /// Allow entering the app shell after sign-in without desktop pairing.
  ///
  /// On by default in **debug** (`flutter run`). Never in production **release**.
  /// Opt in elsewhere with `--dart-define=EXOSITES_DEV_SKIP_PAIR=true`.
  static bool get allowDevSkipPair => resolveDevSkip(
        releaseMode: kReleaseMode,
        flavorName: flavor,
        debugMode: kDebugMode,
        defineEnabled: _devSkipPairDefine,
      );

  /// Skip trial + profile + sources only. Server still enforces store checkout.
  ///
  /// On by default in **debug**. Never in production **release**. Never set
  /// `EXOSITES_DEV_SKIP_FIRST_RUN` in `mobile/env/production.json`.
  static bool get allowDevSkipFirstRun => resolveDevSkip(
        releaseMode: kReleaseMode,
        flavorName: flavor,
        debugMode: kDebugMode,
        defineEnabled: _devSkipFirstRunDefine,
      );
}
