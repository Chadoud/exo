import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/pending_action_edits.dart';
import 'package:exosites_mobile/sync/pending_action_payload.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('confirm queues status=confirmed without a draft_token', () async {
    final path = '${Directory.systemTemp.path}/pending_edit_${DateTime.now().microsecondsSinceEpoch}.db';
    final store = LocalBrainStore(databasePath: path);
    await store.upsertRecord(
      collection: pendingActionsCollection,
      recordId: 'mail_reply:9',
      payloadJson: jsonEncode({
        'type': 'mail_reply',
        'status': 'ready',
        'subject': 'Re: Lunch',
        'body': 'See you',
        'to_email': 'ada@example.com',
      }),
      updatedAt: '2026-09-07T00:00:00Z',
    );
    final ok = await applyPendingActionConfirm(
      store: store,
      recordId: 'mail_reply:9',
      subject: 'Re: Lunch',
      body: 'On my way',
      now: '2026-09-07T12:00:00Z',
      deviceId: 'phone-1',
    );
    expect(ok, isTrue);
    final row = await store.readRecord(
      collection: pendingActionsCollection,
      recordId: 'mail_reply:9',
    );
    final payload = pendingActionPayloadOf(row!);
    expect(payload['status'], 'confirmed');
    expect(payload['body'], 'On my way');
    expect(payload.containsKey('draft_token'), isFalse);
    expect(await store.listPendingPush(), hasLength(1));
  });

  test('confirm refuses rows that are not ready', () async {
    final path = '${Directory.systemTemp.path}/pending_edit_${DateTime.now().microsecondsSinceEpoch}.db';
    final store = LocalBrainStore(databasePath: path);
    await store.upsertRecord(
      collection: pendingActionsCollection,
      recordId: 'mail_reply:2',
      payloadJson: jsonEncode({
        'type': 'mail_reply',
        'status': 'needs_desktop',
        'body': 'See you',
      }),
      updatedAt: '2026-09-07T00:00:00Z',
    );
    expect(
      await applyPendingActionConfirm(
        store: store,
        recordId: 'mail_reply:2',
        subject: 'Re: Lunch',
        body: 'On my way',
        now: '2026-09-07T12:00:00Z',
        deviceId: 'phone-1',
      ),
      isFalse,
    );
  });

  test('countReadyPendingActions counts ready rows only', () {
    expect(
      countReadyPendingActions([
        {
          'record_id': 'a',
          'payload_json': jsonEncode({'status': 'ready'}),
        },
        {
          'record_id': 'b',
          'payload_json': jsonEncode({'status': 'confirmed'}),
        },
        {
          'record_id': 'c',
          'payload_json': jsonEncode({'status': 'ready'}),
        },
      ]),
      2,
    );
  });
}
