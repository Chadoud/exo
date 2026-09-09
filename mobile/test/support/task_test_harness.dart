import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/features/tasks/tasks_screen.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'product_theme.dart';

int _dbSerial = 0;

String uniqueTaskDbPath() {
  _dbSerial++;
  return '${Directory.systemTemp.path}/exo_tasks_${DateTime.now().microsecondsSinceEpoch}_$_dbSerial.db';
}

Future<LocalBrainStore> seedTwoTasks(WidgetTester tester) async {
  final store = LocalBrainStore(databasePath: uniqueTaskDbPath());
  await tester.runAsync(() async {
    await store.clearAll();
    await store.upsertRecord(
      collection: 'tasks',
      recordId: '2',
      payloadJson:
          '{"description":"Done already","completed":true,"priority":"normal"}',
      updatedAt: '2026-07-20T12:00:00Z',
    );
    await store.upsertRecord(
      collection: 'tasks',
      recordId: '1',
      payloadJson:
          '{"description":"Call the landlord","completed":false,"priority":"high","due_at":"2026-07-25T09:00:00Z"}',
      updatedAt: '2026-07-21T12:00:00Z',
    );
  });
  return store;
}

Future<MobileSyncConfig> pumpedTasks(
  WidgetTester tester,
  LocalBrainStore store, {
  bool paired = false,
}) async {
  final storage = MemoryKeyValueStore();
  if (paired) {
    await storage.write('access_token', 'tok');
    await storage.write('sync_paired', '1');
  }
  final config = MobileSyncConfig(
    storage: storage,
    localStore: store,
  );
  await tester.runAsync(config.hydrate);
  await tester.pumpWidget(
    MaterialApp(
      theme: productTheme(),
      home: Scaffold(body: TasksScreen(config: config)),
    ),
  );
  await tester.runAsync(() async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
  });
  await tester.pump();
  if (paired) {
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 250));
    });
    await tester.pump();
  }
  return config;
}

Future<void> waitUntil(WidgetTester tester, bool Function() ready) async {
  for (var i = 0; i < 40 && !ready(); i++) {
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pump();
  }
}
