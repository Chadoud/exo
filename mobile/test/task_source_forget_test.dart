import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/task_source_forget.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

int _dbSerial = 0;

String _tempDb() =>
    '${Directory.systemTemp.path}/task_forget_${++_dbSerial}.db';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('forget_source drops older harvested tasks and keeps typed ones', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: '95',
      payloadJson: jsonEncode({'description': 'Starred mail', 'source': 'gmail'}),
      updatedAt: '2026-09-01T00:00:00Z',
    );
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: '12',
      payloadJson: jsonEncode({'description': 'Buy milk', 'source': 'manual'}),
      updatedAt: '2026-09-01T00:00:00Z',
    );
    final dropped = await applyTaskSourceForget(
      store: store,
      payload: {'forget_source': 'gmail'},
      updatedAt: '2026-09-08T12:00:00Z',
    );
    expect(dropped, 1);
    expect(await store.readRecord(collection: tasksCollection, recordId: '95'), isNull);
    expect(await store.readRecord(collection: tasksCollection, recordId: '12'), isNotNull);
  });

  test('forget_source ignores unknown sources and newer harvested rows', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: '96',
      payloadJson: jsonEncode({'description': 'New mail', 'source': 'gmail'}),
      updatedAt: '2026-09-09T00:00:00Z',
    );
    expect(
      await applyTaskSourceForget(
        store: store,
        payload: {'forget_source': 'not-a-source'},
        updatedAt: '2026-09-08T12:00:00Z',
      ),
      0,
    );
    expect(
      await applyTaskSourceForget(
        store: store,
        payload: {'forget_source': 'gmail'},
        updatedAt: '2026-09-08T12:00:00Z',
      ),
      0,
    );
    expect(await store.readRecord(collection: tasksCollection, recordId: '96'), isNotNull);
  });

  test('live task payload with forget_source does not mass-delete', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: '95',
      payloadJson: jsonEncode({'description': 'Starred mail', 'source': 'gmail'}),
      updatedAt: '2026-09-01T00:00:00Z',
    );
    expect(
      await applyTaskSourceForgetIfMarker(
        store: store,
        recordId: '95',
        deleted: false,
        payload: {'forget_source': 'gmail'},
        updatedAt: '2026-09-08T12:00:00Z',
      ),
      0,
    );
    expect(await store.readRecord(collection: tasksCollection, recordId: '95'), isNotNull);
  });

  test('marker without updated_at does not delete harvested rows', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: '95',
      payloadJson: jsonEncode({'description': 'Starred mail', 'source': 'gmail'}),
      updatedAt: '2026-09-01T00:00:00Z',
    );
    expect(
      await applyTaskSourceForgetIfMarker(
        store: store,
        recordId: 'source_forget:gmail',
        deleted: true,
        payload: {'forget_source': 'gmail'},
        updatedAt: null,
      ),
      0,
    );
    expect(await store.readRecord(collection: tasksCollection, recordId: '95'), isNotNull);
  });

  test('control records are hidden from the task list', () {
    expect(isSyncControlTaskRecord(sourceForgetCapabilityId), isTrue);
    expect(isSyncControlTaskRecord('source_forget:gmail'), isTrue);
    expect(isSyncControlTaskRecord('12'), isFalse);
  });
}
