import 'key_value_store.dart';
import 'sync_engine.dart';

/// iOS Keychain outlives uninstall; SQLite does not. A leftover pull cursor
/// then reports “up to date” with an empty local brain.
///
/// Returns true when the cursor and ever-synced flags were cleared.
Future<bool> resetStalePullCursor({
  required KeyValueStore storage,
  required bool paired,
  required int recordCount,
  required String hasEverSyncedKey,
}) async {
  if (!paired || recordCount > 0) return false;
  final raw = await storage.read(SyncEngine.cursorStorageKey);
  final cursor = int.tryParse(raw ?? '') ?? 0;
  if (cursor <= 0) return false;
  await storage.delete(SyncEngine.cursorStorageKey);
  await storage.delete(hasEverSyncedKey);
  await storage.delete('last_sync_label');
  return true;
}
