import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/sync/cloud_api.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/source_stop.dart';
import 'package:exosites_mobile/sync/sync_engine.dart';
import 'package:exosites_mobile/sync/task_source_forget.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

int _dbSerial = 0;

String _tempDb() =>
    '${Directory.systemTemp.path}/source_stop_${DateTime.now().microsecondsSinceEpoch}_${++_dbSerial}.db';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('capability and phase helpers', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    expect(await hasSourceForgetCapability(store), isFalse);
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: sourceForgetCapabilityId,
      payloadJson: jsonEncode({'capability': 'source_forget_v1'}),
    );
    expect(await hasSourceForgetCapability(store), isTrue);
    expect(await sourceStopPhase(store, 'gmail'), SourceStopPhase.ready);
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: 'source_forget:gmail',
      payloadJson: jsonEncode({
        'forget_source': 'gmail',
        'stop_state': 'waiting',
      }),
    );
    expect(await sourceStopPhase(store, 'gmail'), SourceStopPhase.waiting);
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: 'source_forget:gmail',
      payloadJson: jsonEncode({
        'forget_source': 'gmail',
        'stop_state': 'paused',
      }),
    );
    expect(await sourceStopPhase(store, 'gmail'), SourceStopPhase.paused);
  });

  test('queueSourceStop undoes the marker when push fails', () async {
    final store = LocalBrainStore(databasePath: _tempDb());
    await store.upsertRecord(
      collection: tasksCollection,
      recordId: '95',
      payloadJson: jsonEncode({
        'description': 'Starred mail',
        'source': 'gmail',
      }),
      updatedAt: '2026-09-01T00:00:00Z',
    );
    final engine = SyncEngine(
      cloudUrl: 'https://example.invalid',
      accessToken: 'tok',
      deviceId: 'phone-1',
      api: CloudApi(
        baseUrl: 'https://example.invalid',
        accessToken: () => 'tok',
        httpClient: MockClient((_) async => http.Response('no', 500)),
      ),
      storage: MemoryKeyValueStore(),
      localStore: store,
    );
    expect(
      await queueSourceStop(
        store: store,
        engine: engine,
        source: 'gmail',
        deviceId: 'phone-1',
      ),
      isFalse,
    );
    expect(
      await store.readRecord(
        collection: tasksCollection,
        recordId: 'source_forget:gmail',
      ),
      isNull,
    );
    expect(
      await store.readRecord(collection: tasksCollection, recordId: '95'),
      isNotNull,
    );
  });
}
