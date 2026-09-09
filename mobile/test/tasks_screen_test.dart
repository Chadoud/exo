import 'dart:convert';

import 'package:exosites_mobile/features/tasks/task_detail_sheet.dart';
import 'package:exosites_mobile/features/tasks/task_due_label.dart';
import 'package:exosites_mobile/features/tasks/task_list_tile.dart';
import 'package:exosites_mobile/notifications/due_reminder_copy.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/task_source_forget.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'support/task_test_harness.dart';

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
    expect(
      TaskListTile.metaLine(
        {'due_at': '2026-09-07T09:00:00'},
        now: DateTime(2026, 9, 7, 12),
        locale: const Locale('en'),
      ),
      'Today',
    );
  });

  test('relative due labels', () {
    final now = DateTime(2026, 9, 7, 15);
    expect(
      formatTaskDue(DateTime(2026, 9, 7, 9), now: now, french: false),
      'Today',
    );
    expect(
      formatTaskDue(DateTime(2026, 9, 8, 9), now: now, french: false),
      'Tomorrow',
    );
    expect(
      formatTaskDue(DateTime(2026, 9, 6, 9), now: now, french: false),
      'Overdue · Sep 6',
    );
    expect(
      formatTaskDue(DateTime(2026, 9, 6, 9), now: now, french: true),
      'En retard · 6 sept.',
    );
    expect(
      taskDueIsOverdue({'due_at': '2026-09-06T09:00:00'}, now: now),
      isTrue,
    );
  });

  testWidgets('Open filter hides completed; Done shows completed', (tester) async {
    final store = await seedTwoTasks(tester);
    await pumpedTasks(tester, store);

    expect(find.text('Call the landlord'), findsOneWidget);
    expect(find.text('Done already'), findsNothing);
    expect(find.text('Suggested by EXO'), findsNothing);
    expect(find.text(SyncUserMessages.taskFilterAll), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, SyncUserMessages.taskFilterDone));
    await tester.pump();
    expect(find.text('Call the landlord'), findsNothing);
    expect(find.text('Done already'), findsOneWidget);
  });

  testWidgets('tapping the title opens the sheet; Mark done leaves Open', (tester) async {
    final store = await _oneTask(tester, '5', 'Buy stamps');
    await pumpedTasks(tester, store);
    expect(find.text('Buy stamps'), findsOneWidget);

    await tester.tap(find.text('Buy stamps'));
    await tester.pumpAndSettle();
    expect(find.byType(TaskDetailSheet), findsOneWidget);
    expect(find.text(SyncUserMessages.taskSelectAll), findsNothing);
    var row = (await tester.runAsync(() => store.listByCollection('tasks')))!.single;
    var payload = jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
    expect(payload['completed'], isFalse);

    await tester.ensureVisible(find.widgetWithText(FilledButton, SyncUserMessages.taskMarkDone));
    await tester.tap(find.widgetWithText(FilledButton, SyncUserMessages.taskMarkDone));
    await tester.pumpAndSettle();
    await waitUntil(tester, () => find.text('Buy stamps').evaluate().isEmpty);

    expect(find.text('Buy stamps'), findsNothing);
    expect(find.text(SyncUserMessages.markedDone), findsOneWidget);
    expect(find.text(SyncUserMessages.tasksOpenEmptyTitle), findsOneWidget);

    await tester.tap(find.widgetWithText(ChoiceChip, SyncUserMessages.taskFilterDone));
    await tester.pump();
    expect(find.text('Buy stamps'), findsOneWidget);

    row = (await tester.runAsync(() => store.listByCollection('tasks')))!.single;
    payload = jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
    expect(payload['completed'], isTrue);
  });

  testWidgets('checkbox tap starts multi-select without completing', (tester) async {
    final store = await _oneTask(tester, '5', 'Buy stamps');
    await pumpedTasks(tester, store);

    await tester.tap(find.byIcon(Icons.check_box_outline_blank));
    await tester.pump();
    expect(find.text(SyncUserMessages.taskSelectAll), findsOneWidget);
    expect(find.byType(TaskDetailSheet), findsNothing);

    final row = (await tester.runAsync(() => store.listByCollection('tasks')))!.single;
    final payload = jsonDecode(row['payload_json'] as String) as Map<String, dynamic>;
    expect(payload['completed'], isFalse);
  });

  testWidgets('long-press select marks two tasks done and exits select', (tester) async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '1',
        payloadJson: jsonEncode({'description': 'First open', 'completed': false}),
        updatedAt: '2026-08-01T00:00:00Z',
      );
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '2',
        payloadJson: jsonEncode({'description': 'Second open', 'completed': false}),
        updatedAt: '2026-08-02T00:00:00Z',
      );
    });
    await pumpedTasks(tester, store);

    await tester.longPress(find.text('First open'));
    await tester.pump();
    expect(find.text(SyncUserMessages.taskSelectAll), findsOneWidget);
    expect(find.text('Delete'), findsNothing);
    expect(find.text('Edit'), findsNothing);
    expect(find.text(SyncUserMessages.taskRemove), findsOneWidget);

    await tester.tap(find.text('Second open'));
    await tester.pump();
    expect(find.text(SyncUserMessages.tasksSelected(2)), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, SyncUserMessages.taskMarkDone));
    await waitUntil(tester, () => find.text('First open').evaluate().isEmpty);

    expect(find.text('First open'), findsNothing);
    expect(find.text('Second open'), findsNothing);
    expect(find.text(SyncUserMessages.taskSelectAll), findsNothing);
    expect(find.text(SyncUserMessages.tasksMarkedDone(2)), findsOneWidget);
  });

  testWidgets('Select all on Open; changing filter clears selection', (tester) async {
    final store = await seedTwoTasks(tester);
    await pumpedTasks(tester, store);

    await tester.longPress(find.text('Call the landlord'));
    await tester.pump();
    await tester.tap(find.text(SyncUserMessages.taskSelectAll));
    await tester.pump();
    expect(find.text(SyncUserMessages.tasksSelected(1)), findsOneWidget);

    await tester.tap(find.widgetWithText(ChoiceChip, SyncUserMessages.taskFilterDone));
    await tester.pump();
    expect(find.text(SyncUserMessages.taskSelectAll), findsNothing);
    expect(find.text('Call the landlord'), findsNothing);
    expect(find.text('Done already'), findsOneWidget);
  });

  testWidgets('Remove asks once then hides the task', (tester) async {
    final store = await _oneTask(tester, 'prep', 'Prepare for: Team standup');
    await pumpedTasks(tester, store);

    await tester.longPress(find.text('Prepare for: Team standup'));
    await tester.pump();
    await tester.tap(find.text(SyncUserMessages.taskRemove));
    await tester.pump();
    expect(find.text(SyncUserMessages.taskRemoveConfirmTitle), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, SyncUserMessages.taskRemove).last);
    await waitUntil(tester, () => find.text('Prepare for: Team standup').evaluate().isEmpty);
    expect(find.text('Prepare for: Team standup'), findsNothing);
    expect(find.text(SyncUserMessages.tasksRemoved(1)), findsOneWidget);
  });

  testWidgets('gmail task offers Stop when desktop advertised capability', (tester) async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: 'tasks',
        recordId: sourceForgetCapabilityId,
        payloadJson: '{"capability":"source_forget_v1"}',
      );
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '8',
        payloadJson: jsonEncode({
          'description': 'Starred mail',
          'source': 'gmail',
          'completed': false,
        }),
        updatedAt: '2026-09-01T00:00:00Z',
      );
    });
    await pumpedTasks(tester, store, paired: true);
    await tester.tap(find.text('Starred mail'));
    await tester.pumpAndSettle();
    expect(find.text('From Gmail'), findsOneWidget);
    expect(find.text('Stop adding from Gmail'), findsOneWidget);
  });

  testWidgets('tapping a joined mail task shows the draft in the sheet', (tester) async {
    final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: 'tasks',
        recordId: '5',
        payloadJson: jsonEncode({
          'description': 'Reply to Ada',
          'completed': false,
        }),
        updatedAt: '2026-08-01T00:00:00Z',
      );
      await store.upsertRecord(
        collection: 'pending_actions',
        recordId: 'mail_reply:9',
        payloadJson: jsonEncode({
          'type': 'mail_reply',
          'status': 'ready',
          'task_record_id': '5',
          'subject': 'Re: Lunch',
          'body': 'See you at noon',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
    });
    await pumpedTasks(tester, store, paired: true);

    await tester.tap(find.text('Reply to Ada'));
    await tester.pumpAndSettle();
    final copy = DueReminderCopy(const Locale('en'));
    await waitUntil(tester, () => find.text(copy.actionCardTitle).evaluate().isNotEmpty);

    expect(find.byType(TaskDetailSheet), findsOneWidget);
    expect(find.text(copy.actionCardTitle), findsOneWidget);
    expect(find.text('Re: Lunch'), findsWidgets);
    expect(find.text(copy.actionSend), findsOneWidget);
    expect(find.text(SyncUserMessages.taskMarkDone), findsOneWidget);

    await tester.tap(find.text(copy.actionSend));
    await tester.pump();
    expect(find.text(copy.actionConfirmTitle), findsOneWidget);
    expect(find.text(copy.actionConfirmBody), findsOneWidget);
    expect(find.text(SyncUserMessages.cancel), findsOneWidget);
  });
}

Future<LocalBrainStore> _oneTask(
  WidgetTester tester,
  String recordId,
  String description,
) async {
  final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
  await tester.runAsync(() async {
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: recordId,
      payloadJson: jsonEncode({
        'description': description,
        'completed': false,
        'priority': 'normal',
      }),
      updatedAt: '2026-08-01T00:00:00Z',
    );
  });
  return store;
}
