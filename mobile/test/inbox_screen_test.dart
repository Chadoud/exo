import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'support/product_theme.dart';
import 'package:exosites_mobile/features/inbox/inbox_copy.dart';
import 'package:exosites_mobile/features/inbox/inbox_screen.dart';
import 'package:exosites_mobile/notifications/due_reminder_copy.dart';
import 'package:exosites_mobile/sync/inbox_edits.dart';
import 'package:exosites_mobile/sync/inbox_payload.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/pending_action_payload.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

int _dbSerial = 0;

String _tempDb() => '${Directory.systemTemp.path}/inbox_ui_${++_dbSerial}.db';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('joins pending actions to a task record id', () {
    final rows = [
      {
        'record_id': 'mail_reply:9',
        'payload_json': jsonEncode({'task_record_id': '5', 'status': 'ready'}),
      },
    ];
    expect(pendingRecordIdForTask(rows, '5'), 'mail_reply:9');
    expect(pendingRowForTask(rows, '5')?['record_id'], 'mail_reply:9');
    expect(pendingRecordIdForTask(const [], '5'), isNull);
    expect(pendingRowForTask(const [], '5'), isNull);
  });

  test('inbox badge counts ready mail, nudges, and failures', () {
    expect(
      countInboxAttention(
        pending: [
          {
            'payload_json': jsonEncode({'status': 'ready'}),
            'pending_delete': 0,
          },
          {
            'payload_json': jsonEncode({'status': 'confirmed'}),
            'pending_delete': 0,
          },
        ],
        nudges: [
          {
            'payload_json': jsonEncode({'title': 'Try a recap'}),
            'pending_delete': 0,
          },
        ],
        failures: [
          {
            'payload_json': jsonEncode({'goal': 'Book the flight'}),
            'pending_delete': 0,
          },
        ],
      ),
      3,
    );
  });

  test('body-only nudge counts toward the Inbox badge', () {
    expect(
      countInboxAttention(
        pending: const [],
        nudges: [
          {
            'payload_json': jsonEncode({'body': 'You asked for a recap.'}),
            'pending_delete': 0,
          },
        ],
        failures: const [],
      ),
      1,
    );
  });

  test('failed-tasks nudge is hidden from the list and badge', () {
    final rows = [
      {
        'payload_json': jsonEncode({'title': 'Review recent failed tasks'}),
        'pending_delete': 0,
      },
      {
        'payload_json': jsonEncode({'title': 'Try a recap'}),
        'pending_delete': 0,
      },
    ];
    final visible = visibleInboxNudges(rows);
    expect(visible, hasLength(1));
    expect(inboxPayloadOf(visible.single)['title'], 'Try a recap');
    expect(
      countInboxAttention(pending: const [], nudges: rows, failures: const []),
      1,
    );
  });

  test('dismiss queues a tombstone for nudges only', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await store.upsertRecord(
      collection: nudgesCollection,
      recordId: '3',
      payloadJson: jsonEncode({'title': 'Try a recap', 'body': 'You asked.'}),
      updatedAt: '2026-09-07T00:00:00Z',
    );
    expect(
      await applyInboxDismiss(
        store: store,
        collection: pendingActionsCollection,
        recordId: 'mail_reply:1',
        now: '2026-09-07T12:00:00Z',
        deviceId: 'phone',
      ),
      isFalse,
    );
    expect(
      await applyInboxDismiss(
        store: store,
        collection: nudgesCollection,
        recordId: '3',
        now: '2026-09-07T12:00:00Z',
        deviceId: 'phone',
      ),
      isTrue,
    );
    final row = (await store.listByCollection(nudgesCollection)).single;
    expect(LocalBrainStore.rowIsPendingDelete(row), isTrue);
  });

  testWidgets('ready mail action shows review card and honest send copy', (tester) async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: pendingActionsCollection,
        recordId: 'mail_reply:9',
        payloadJson: jsonEncode({
          'type': 'mail_reply',
          'status': 'ready',
          'to_email': 'ada@example.com',
          'inbound_subject': 'Lunch',
          'inbound_snippet': 'Are you free Thursday?',
          'subject': 'Re: Lunch',
          'body': 'See you at noon',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
    });
    await _pumpedInbox(tester, store);
    final copy = DueReminderCopy(const Locale('en'));
    expect(find.text(copy.actionSection.toUpperCase()), findsOneWidget);
    expect(find.text(copy.actionCardTitle), findsOneWidget);
    expect(find.text(copy.actionSend), findsNothing);
    await tester.tap(find.text(copy.actionCardTitle));
    await tester.pump();
    expect(find.text(copy.actionContext.toUpperCase()), findsOneWidget);
    expect(find.text('Are you free Thursday?'), findsOneWidget);
    expect(find.text(copy.actionReply.toUpperCase()), findsOneWidget);
    expect(find.text('Re: Lunch'), findsWidgets);
    await tester.tap(find.text(copy.actionSend));
    await tester.pump();
    expect(find.text(copy.actionConfirmTitle), findsOneWidget);
    expect(find.text(copy.actionConfirmBody), findsOneWidget);
    expect(find.text(copy.actionSend), findsWidgets);
    expect(find.text(SyncUserMessages.cancel), findsOneWidget);
  });

  testWidgets('confirmed mail action uses waiting title, not Reply ready', (tester) async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: pendingActionsCollection,
        recordId: 'mail_reply:2',
        payloadJson: jsonEncode({
          'type': 'mail_reply',
          'status': 'confirmed',
          'to_email': 'ada@example.com',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
    });
    await _pumpedInbox(tester, store);
    final copy = DueReminderCopy(const Locale('en'));
    expect(find.text(copy.actionCardWaitingTitle), findsOneWidget);
    expect(find.text(copy.actionCardTitle), findsNothing);
  });

  testWidgets('To send hides nudges; Needs a look hides mail', (tester) async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: pendingActionsCollection,
        recordId: 'mail_reply:9',
        payloadJson: jsonEncode({
          'type': 'mail_reply',
          'status': 'ready',
          'to_email': 'ada@example.com',
          'subject': 'Re: Lunch',
          'body': 'See you at noon',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
      await store.upsertRecord(
        collection: nudgesCollection,
        recordId: '1',
        payloadJson: jsonEncode({
          'kind': 'suggestion',
          'title': 'Try a recap',
          'body': 'You asked for one.',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
    });
    await _pumpedInbox(tester, store);
    final inbox = InboxCopy(const Locale('en'));
    final due = DueReminderCopy(const Locale('en'));
    expect(find.text(inbox.toSend), findsOneWidget);
    expect(find.text(due.actionCardTitle), findsOneWidget);
    expect(find.text('Try a recap'), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, inbox.needsLook));
    await tester.pump();
    expect(find.text('Try a recap'), findsOneWidget);
    expect(find.text(due.actionCardTitle), findsNothing);
  });

  testWidgets('nudge and failure cards dismiss locally', (tester) async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await tester.runAsync(() async {
      await store.clearAll();
      await store.upsertRecord(
        collection: nudgesCollection,
        recordId: '1',
        payloadJson: jsonEncode({
          'kind': 'suggestion',
          'title': 'Try a recap',
          'body': 'You asked for one.',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
      await store.upsertRecord(
        collection: agentFailuresCollection,
        recordId: '2',
        payloadJson: jsonEncode({
          'goal': 'Book the flight',
          'outcome': 'Calendar was closed',
        }),
        updatedAt: '2026-09-07T00:00:00Z',
      );
    });
    await _pumpedInbox(tester, store);
    final copy = InboxCopy(const Locale('en'));
    expect(find.text('Try a recap'), findsOneWidget);
    expect(find.text('Book the flight'), findsOneWidget);
    await tester.tap(find.text('Try a recap'));
    await tester.pump();
    expect(find.text(copy.dismiss), findsWidgets);
    await tester.tap(find.text(copy.dismiss).first);
    await tester.pump();
    var gone = false;
    for (var i = 0; i < 24; i++) {
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pump();
      if (find.text('Try a recap').evaluate().isEmpty) {
        gone = true;
        break;
      }
    }
    expect(gone, isTrue);
  });

  testWidgets('empty Inbox hides chips and shows one empty', (tester) async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await tester.runAsync(store.clearAll);
    await _pumpedInbox(
      tester,
      store,
      everSynced: true,
      waitFor: InboxCopy(const Locale('en')).emptyTitle,
    );
    final inbox = InboxCopy(const Locale('en'));
    expect(find.text(inbox.emptyTitle), findsOneWidget);
    expect(find.text(inbox.toSend), findsNothing);
    expect(find.text(inbox.needsLook), findsNothing);
  });
}

Future<void> _pumpedInbox(
  WidgetTester tester,
  LocalBrainStore store, {
  bool everSynced = false,
  String? waitFor,
}) async {
  final storage = MemoryKeyValueStore();
  await storage.write('access_token', 'tok');
  await storage.write('sync_paired', '1');
  if (everSynced) await storage.write('has_ever_synced', '1');
  final config = MobileSyncConfig(storage: storage, localStore: store);
  await tester.runAsync(config.hydrate);
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('en'),
      theme: productTheme(),
      home: Scaffold(body: InboxScreen(config: config)),
    ),
  );
  for (var i = 0; i < 20; i++) {
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pump();
    if (waitFor != null) {
      if (find.text(waitFor).evaluate().isNotEmpty) return;
      continue;
    }
    if (find.text('READY TO SEND').evaluate().isNotEmpty ||
        find.text('Try a recap').evaluate().isNotEmpty ||
        find.text('Waiting on your computer').evaluate().isNotEmpty) {
      return;
    }
  }
}
