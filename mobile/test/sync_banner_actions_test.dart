import 'package:exosites_mobile/design/exo_status_banner.dart';
import 'package:exosites_mobile/layout/adaptive_shell.dart';
import 'package:exosites_mobile/sync/sync_banner_actions.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('auth expired and needs sign-in map to Sign in again', () {
    expect(bannerActionFor(ExoStatusKind.authExpired)?.$1, SyncUserMessages.signInAgain);
    expect(bannerActionFor(ExoStatusKind.authExpired)?.$2, SyncBannerAction.signIn);
    expect(bannerActionFor(ExoStatusKind.needsSignIn)?.$2, SyncBannerAction.signIn);
  });

  test('needs pair and decrypt map to pair recovery', () {
    expect(bannerActionFor(ExoStatusKind.needsPair)?.$1, SyncUserMessages.scanDesktopCode);
    expect(bannerActionFor(ExoStatusKind.needsPair)?.$2, SyncBannerAction.pair);
    expect(bannerActionFor(ExoStatusKind.decryptError)?.$1, SyncUserMessages.pairAgain);
    expect(bannerActionFor(ExoStatusKind.decryptError)?.$2, SyncBannerAction.pair);
  });

  test('network and generic errors map to retry', () {
    expect(bannerActionFor(ExoStatusKind.networkError)?.$2, SyncBannerAction.retry);
    expect(bannerActionFor(ExoStatusKind.error)?.$2, SyncBannerAction.retry);
  });

  test('ready/syncing/info have no CTA', () {
    expect(bannerActionFor(ExoStatusKind.ready), isNull);
    expect(bannerActionFor(ExoStatusKind.syncing), isNull);
    expect(bannerActionFor(ExoStatusKind.info), isNull);
  });

  test('shell tabs are Memory Tasks without Capture; Memory is default index 0', () {
    expect(AdaptiveShell.tabLabels, ['Memory', 'Tasks']);
    expect(AdaptiveShell.tabLabels.contains('Capture'), isFalse);
    expect(AdaptiveShell.tabLabels.indexOf('Memory'), 0);
  });
}

