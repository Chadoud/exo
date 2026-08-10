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
}
