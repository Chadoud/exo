import 'dart:convert';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'support/task_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('local store round-trips tasks collection', () async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: '1',
      payloadJson: jsonEncode({
        'description': 'Call the landlord',
        'completed': false,
      }),
      updatedAt: '2026-07-21T12:00:00Z',
    );
    final rows = await store.listByCollection('tasks');
    expect(rows, hasLength(1));
    expect(rows.first['record_id'], '1');
  });

  test('pending push queue: clock guard keeps re-edited rows flagged', () async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await store.clearAll();
    await store.applyLocalEdit(
      collection: 'tasks',
      recordId: '1',
      payloadJson: '{"completed":true}',
      updatedAt: '2026-08-11T20:00:00Z',
      logicalClock: 100,
      deviceId: 'mobile-1',
    );
    expect(await store.listPendingPush(), hasLength(1));

    await store.clearPendingPush(collection: 'tasks', recordId: '1', logicalClock: 99);
    expect(await store.listPendingPush(), hasLength(1));

    await store.clearPendingPush(collection: 'tasks', recordId: '1', logicalClock: 100);
    expect(await store.listPendingPush(), isEmpty);

    await store.applyLocalEdit(
      collection: 'tasks',
      recordId: '1',
      payloadJson: '{"completed":true}',
      updatedAt: '2026-08-11T21:00:00Z',
      logicalClock: 200,
      deviceId: 'mobile-1',
    );
    await store.upsertRecord(
      collection: 'tasks',
      recordId: '1',
      payloadJson: '{"completed":true}',
      updatedAt: '2026-08-11T22:00:00Z',
      logicalClock: 300,
      deviceId: 'desktop-1',
    );
    expect(await store.listPendingPush(), isEmpty);
  });

  test('setTaskCompleted rewrites cached payload and queues a push', () async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: '9',
      payloadJson: jsonEncode({'description': 'Water plants', 'completed': false}),
      updatedAt: '2026-08-01T00:00:00Z',
      logicalClock: 10,
      deviceId: 'desktop-1',
    );
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    await config.hydrate();

    expect(
      await config.setTaskCompleted(recordId: '9', completed: true),
      isTrue,
    );
    final row = (await store.listByCollection('tasks')).single;
    final payload = jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
    expect(payload['completed'], isTrue);
    expect(payload['completed_at'], isNotNull);
    expect((row['logical_clock'] as int), greaterThan(10));
    expect(await store.listPendingPush(), hasLength(1));

    expect(
      await config.setTaskCompleted(recordId: 'missing', completed: true),
      isFalse,
    );

    expect(
      await config.setTaskCompleted(recordId: '9', completed: false),
      isTrue,
    );
    final after = (await store.listByCollection('tasks')).single;
    final payload2 = jsonDecode(after['payload_json'] as String) as Map<String, dynamic>;
    expect(payload2['completed'], isFalse);
    expect(payload2['completed_at'], isNull);
  });

  test('setTasksCompleted skips unknown and already-correct ids', () async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: 'open',
      payloadJson: jsonEncode({'description': 'Open', 'completed': false}),
      updatedAt: '2026-08-01T00:00:00Z',
      logicalClock: 10,
      deviceId: 'desktop-1',
    );
    await store.upsertRecord(
      collection: 'tasks',
      recordId: 'done',
      payloadJson: jsonEncode({'description': 'Done', 'completed': true}),
      updatedAt: '2026-08-01T00:00:00Z',
      logicalClock: 10,
      deviceId: 'desktop-1',
    );
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    await config.hydrate();

    expect(
      await config.setTasksCompleted(
        recordIds: ['open', 'done', 'missing'],
        completed: true,
      ),
      1,
    );
    final rows = await store.listByCollection('tasks');
    final byId = {for (final row in rows) row['record_id']: row};
    final openPayload = jsonDecode(byId['open']!['payload_json'] as String);
    final donePayload = jsonDecode(byId['done']!['payload_json'] as String);
    expect(openPayload['completed'], isTrue);
    expect(donePayload['completed'], isTrue);
    expect(byId['done']!['logical_clock'], 10);
    expect(await store.listPendingPush(), hasLength(1));
  });

  test('deleteTasks flags a tombstone and hides the row from Open', () async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: 'prep',
      payloadJson: jsonEncode({
        'description': 'Prepare for: Team standup',
        'completed': false,
      }),
      updatedAt: '2026-08-01T00:00:00Z',
      logicalClock: 10,
      deviceId: 'desktop-1',
    );
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    await config.hydrate();

    expect(await config.deleteTasks(recordIds: ['prep', 'missing']), 1);
    final row = (await store.listByCollection('tasks')).single;
    expect(LocalBrainStore.rowIsPendingDelete(row), isTrue);
    expect(await store.listPendingPush(), hasLength(1));
  });

  test('deleteTasks also tombstones the joined Inbox draft', () async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: '5',
      payloadJson: jsonEncode({
        'description': 'Reply to Ada',
        'completed': false,
      }),
      updatedAt: '2026-08-01T00:00:00Z',
      logicalClock: 10,
      deviceId: 'desktop-1',
    );
    await store.upsertRecord(
      collection: 'pending_actions',
      recordId: 'mail_reply:9',
      payloadJson: jsonEncode({
        'type': 'mail_reply',
        'status': 'ready',
        'task_record_id': '5',
        'subject': 'Re: Lunch',
      }),
      updatedAt: '2026-09-07T00:00:00Z',
      logicalClock: 4,
      deviceId: 'desktop-1',
    );
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    await config.hydrate();

    expect(await config.deleteTasks(recordIds: ['5']), 1);
    final inbox = (await store.listByCollection('pending_actions')).single;
    expect(LocalBrainStore.rowIsPendingDelete(inbox), isTrue);
    final pending = await store.listPendingPush();
    expect(pending, hasLength(2));
  });
}
