import '../design/exo_status_banner.dart';
import 'user_messages.dart';

/// Recovery action a status banner should expose.
enum SyncBannerAction { signIn, pair, retry }

/// Maps status kind → CTA label + recovery action (UX table).
(String label, SyncBannerAction action)? bannerActionFor(ExoStatusKind kind) {
  switch (kind) {
    case ExoStatusKind.authExpired:
    case ExoStatusKind.needsSignIn:
      return (SyncUserMessages.signInAgain, SyncBannerAction.signIn);
    case ExoStatusKind.needsPair:
      return (SyncUserMessages.scanDesktopCode, SyncBannerAction.pair);
    case ExoStatusKind.decryptError:
      return (SyncUserMessages.linkAgain, SyncBannerAction.pair);
    case ExoStatusKind.networkError:
    case ExoStatusKind.error:
      return (SyncUserMessages.tryAgain, SyncBannerAction.retry);
    case ExoStatusKind.ready:
    case ExoStatusKind.syncing:
    case ExoStatusKind.info:
      return null;
  }
}
