import '../design/exo_status_banner.dart';
import 'sync_errors.dart';
import 'user_messages.dart';

/// Banner kind + copy for a thrown sync failure.
typedef SyncFailureBanner = ({ExoStatusKind kind, String message});

/// Canonical map from sync exceptions → user-facing banner fields.
SyncFailureBanner describeSyncFailure(Object error) {
  if (error is SyncAuthException) {
    return (kind: ExoStatusKind.authExpired, message: SyncUserMessages.authExpired);
  }
  if (error is SyncNotPairedException) {
    return (kind: ExoStatusKind.needsPair, message: SyncUserMessages.notPaired);
  }
  if (error is SyncDecryptException) {
    return (kind: ExoStatusKind.decryptError, message: SyncUserMessages.decryptFailed);
  }
  if (error is SyncSchemaException) {
    return (kind: ExoStatusKind.error, message: SyncUserMessages.schemaTooOld);
  }
  if (error is SyncNetworkException) {
    return (kind: ExoStatusKind.networkError, message: SyncUserMessages.networkFailed);
  }
  return (kind: ExoStatusKind.error, message: SyncUserMessages.syncFailed);
}
