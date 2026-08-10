import 'package:exosites_mobile/design/exo_status_banner.dart';
import 'package:exosites_mobile/sync/sync_errors.dart';
import 'package:exosites_mobile/sync/sync_failure.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('describeSyncFailure maps known exceptions', () {
    expect(describeSyncFailure(SyncAuthException()).kind, ExoStatusKind.authExpired);
    expect(describeSyncFailure(SyncNotPairedException()).message, SyncUserMessages.notPaired);
    expect(describeSyncFailure(SyncDecryptException()).kind, ExoStatusKind.decryptError);
    expect(describeSyncFailure(SyncSchemaException()).message, SyncUserMessages.schemaTooOld);
    expect(describeSyncFailure(SyncNetworkException()).kind, ExoStatusKind.networkError);
    expect(describeSyncFailure(StateError('x')).kind, ExoStatusKind.error);
    expect(describeSyncFailure(StateError('x')).message, SyncUserMessages.syncFailed);
  });
}
