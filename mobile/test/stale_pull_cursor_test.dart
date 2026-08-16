import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/stale_pull_cursor.dart';
import 'package:exosites_mobile/sync/sync_engine.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('clears leftover cursor only when paired and local cache is empty', () async {
    final storage = MemoryKeyValueStore();
    await storage.write(SyncEngine.cursorStorageKey, '9');
    await storage.write('has_ever_synced', '1');
    await storage.write('last_sync_label', 'earlier');

    expect(
      await resetStalePullCursor(
        storage: storage,
        paired: true,
        recordCount: 3,
        hasEverSyncedKey: 'has_ever_synced',
      ),
      isFalse,
    );
    expect(storage.contains(SyncEngine.cursorStorageKey), isTrue);

    expect(
      await resetStalePullCursor(
        storage: storage,
        paired: true,
        recordCount: 0,
        hasEverSyncedKey: 'has_ever_synced',
      ),
      isTrue,
    );
    expect(storage.contains(SyncEngine.cursorStorageKey), isFalse);
    expect(storage.contains('has_ever_synced'), isFalse);
    expect(storage.contains('last_sync_label'), isFalse);
  });
}
