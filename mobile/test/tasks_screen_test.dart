import 'dart:convert';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/design/exo_theme.dart';
import 'package:exosites_mobile/features/tasks/task_list_tile.dart';
import 'package:exosites_mobile/features/tasks/tasks_screen.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('TaskListTile title and completed helpers', () {
    expect(
      TaskListTile.titleOf({'description': 'Send weekly report'}),
      'Send weekly report',
    );
    expect(TaskListTile.isCompleted({'completed': true}), isTrue);
    expect(TaskListTile.isCompleted({'completed': 0}), isFalse);
    expect(TaskListTile.metaLine({'completed': true}), SyncUserMessages.taskCompletedLabel);
  });

  test('local store round-trips tasks collection', () async {
    final store = LocalBrainStore(databasePath: ':memory:');
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
    // ':memory:' is a shared singleton per test file — start clean.
    final store = LocalBrainStore(databasePath: ':memory:');
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

    // Clearing with a stale clock (row edited again mid-push) keeps the flag.
    await store.clearPendingPush(collection: 'tasks', recordId: '1', logicalClock: 99);
    expect(await store.listPendingPush(), hasLength(1));

    await store.clearPendingPush(collection: 'tasks', recordId: '1', logicalClock: 100);
    expect(await store.listPendingPush(), isEmpty);

    // Pull-applied rows supersede any queued edit.
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
    final store = LocalBrainStore(databasePath: ':memory:');
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

    // Not paired — the immediate push fails silently and the edit stays queued.
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

    // Unknown record: no-op.
    expect(
      await config.setTaskCompleted(recordId: 'missing', completed: true),
      isFalse,
    );

    // Un-complete clears completed_at.
    expect(
      await config.setTaskCompleted(recordId: '9', completed: false),
      isTrue,
    );
    final after = (await store.listByCollection('tasks')).single;
    final payload2 = jsonDecode(after['payload_json'] as String) as Map<String, dynamic>;
    expect(payload2['completed'], isFalse);
    expect(payload2['completed_at'], isNull);
  });

  test('deleteTasks flags a tombstone and hides the row from Open', () async {
    final store = LocalBrainStore(databasePath: ':memory:');
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

  testWidgets('TasksScreen lists synced tasks incomplete first', (tester) async {
    final store = LocalBrainStore(databasePath: ':memory:');
    await tester.runAsync(() async {
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '2',
        payloadJson: jsonEncode({
          'description': 'Done already',
          'completed': true,
          'priority': 'normal',
        }),
        updatedAt: '2026-07-20T12:00:00Z',
      );
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '1',
        payloadJson: jsonEncode({
          'description': 'Call the landlord',
          'completed': false,
          'priority': 'high',
          'due_at': '2026-07-25T09:00:00Z',
        }),
        updatedAt: '2026-07-21T12:00:00Z',
      );
    });

    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    await tester.runAsync(config.hydrate);

    await tester.pumpWidget(
      MaterialApp(
        theme: ExoTheme.dark(),
        home: Scaffold(body: TasksScreen(config: config)),
      ),
    );
    expect(find.byType(TasksScreen), findsOneWidget);

    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await tester.pump();

    expect(find.text('Call the landlord'), findsOneWidget);
    expect(find.text('Done already'), findsOneWidget);
    final openY = tester.getTopLeft(find.text('Call the landlord')).dy;
    final doneY = tester.getTopLeft(find.text('Done already')).dy;
    expect(openY, lessThan(doneY));
    expect(find.text('Suggested by EXO'), findsNothing);
  });

  testWidgets('tapping the toggle marks a task done on screen', (tester) async {
    final store = LocalBrainStore(databasePath: ':memory:');
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '5',
        payloadJson: jsonEncode({
          'description': 'Buy stamps',
          'completed': false,
          'priority': 'normal',
        }),
        updatedAt: '2026-08-01T00:00:00Z',
      );
    });
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    await tester.runAsync(config.hydrate);

    await tester.pumpWidget(
      MaterialApp(
        theme: ExoTheme.dark(),
        home: Scaffold(body: TasksScreen(config: config)),
      ),
    );
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await tester.pump();
    expect(find.text('Buy stamps'), findsOneWidget);

    // Tap outside runAsync (gesture dispatch conflicts with the real-async
    // zone), then let the sqlite round-trips complete before asserting.
    await tester.tap(find.bySemanticsLabel(SyncUserMessages.taskMarkDone));
    var found = false;
    for (var i = 0; i < 40 && !found; i++) {
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pump();
      found = find.text(SyncUserMessages.taskCompletedLabel).evaluate().isNotEmpty;
    }

    expect(find.text(SyncUserMessages.taskCompletedLabel), findsOneWidget);
    final row = (await tester.runAsync(() => store.listByCollection('tasks')))!.single;
    final payload = jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
    expect(payload['completed'], isTrue);
  });
}
