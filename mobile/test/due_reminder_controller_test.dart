import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/notifications/due_reminder_controller.dart';
import 'package:exosites_mobile/notifications/due_reminder_copy.dart';
import 'package:exosites_mobile/notifications/due_reminder_host.dart';
import 'package:exosites_mobile/notifications/due_reminder_plan.dart';
import 'package:exosites_mobile/notifications/due_reminder_prefs.dart';
import 'package:exosites_mobile/notifications/remote_wake.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

int _dbSerial = 0;

Future<MobileSyncConfig> _pairedConfig() async {
  final storage = MemoryKeyValueStore();
  await storage.write('access_token', 'tok');
  await storage.write('sync_paired', '1');
  final path = '${Directory.systemTemp.path}/due_ctrl_${++_dbSerial}.db';
  final store = LocalBrainStore(databasePath: path);
  await store.clearAll();
  final config = MobileSyncConfig(
    storage: storage,
    localStore: store,
  );
  await config.hydrate();
  return config;
}

Future<void> _addDueTask(
  MobileSyncConfig config, {
  required String id,
  required DateTime due,
  bool completed = false,
}) async {
  await config.localStore.upsertRecord(
    collection: 'tasks',
    recordId: id,
    payloadJson: jsonEncode({
      'description': 'Pay rent',
      'completed': completed,
      'due_at': due.toIso8601String(),
    }),
    updatedAt: '2026-09-07T00:00:00Z',
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final copy = DueReminderCopy(const Locale('en'));
  final now = DateTime(2026, 9, 7, 12);

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('unpaired session cancels scheduled reminders', () async {
    final config = MobileSyncConfig(
      storage: MemoryKeyValueStore(),
      localStore: LocalBrainStore(databasePath: ':memory:'),
    );
    await config.hydrate();
    final host = MemoryDueReminderHost(permissionGranted: true);
    host.scheduled.add(
      DueReminderPlan(
        recordId: 'x',
        fireAt: now.add(const Duration(hours: 2)),
        title: 't',
        body: 'b',
      ),
    );
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.reconcile(copy: copy);
    expect(host.scheduled, isEmpty);
    controller.dispose();
  });

  test('first due task asks before scheduling', () async {
    final config = await _pairedConfig();
    await _addDueTask(config, id: '1', due: now.add(const Duration(hours: 3)));
    final host = MemoryDueReminderHost(permissionGranted: false);
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.reconcile(copy: copy);
    expect(controller.needsPrompt, isTrue);
    expect(host.scheduled, isEmpty);

    await controller.acceptPrompt(copy);
    expect(controller.needsPrompt, isFalse);
    expect(host.permissionGranted, isTrue);
    expect(host.scheduled, hasLength(1));
    expect(host.scheduled.single.recordId, '1');
    expect(host.scheduled.single.title, 'Task due');
    controller.dispose();
  });

  test('completed or disabled tasks are not scheduled', () async {
    final config = await _pairedConfig();
    await _addDueTask(config, id: '1', due: now.add(const Duration(hours: 3)));
    final host = MemoryDueReminderHost(permissionGranted: true);
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.acceptPrompt(copy);
    expect(host.scheduled, hasLength(1));

    await _addDueTask(
      config,
      id: '1',
      due: now.add(const Duration(hours: 3)),
      completed: true,
    );
    await controller.reconcile(copy: copy);
    expect(host.scheduled, isEmpty);

    await controller.setEnabled(false, copy);
    await _addDueTask(config, id: '2', due: now.add(const Duration(hours: 4)));
    await controller.reconcile(copy: copy);
    expect(host.scheduled, isEmpty);
    controller.dispose();
  });

  test('pre-sync empty list does not ask the OS', () async {
    final config = await _pairedConfig();
    final host = MemoryDueReminderHost();
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.reconcile(copy: copy);
    expect(controller.needsPrompt, isFalse);
    expect(host.requestCount, 0);
    expect(host.scheduled, isEmpty);
    controller.dispose();
  });

  test('sign-out resets reminder prefs so the next account starts clean', () async {
    final config = await _pairedConfig();
    await _addDueTask(config, id: '1', due: now.add(const Duration(hours: 3)));
    final host = MemoryDueReminderHost(permissionGranted: true);
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.acceptPrompt(copy);
    await controller.setLockScreenDetail(true, copy);
    final prefs = DueReminderPrefs(config.storage);
    expect(await prefs.enabled, isTrue);
    expect(await prefs.lockScreenDetail, isTrue);

    await config.clearSession();
    await controller.reconcile(copy: copy);
    expect(host.scheduled, isEmpty);
    expect(await prefs.enabled, isFalse);
    expect(await prefs.lockScreenDetail, isFalse);
    expect(await prefs.asked, isFalse);
    controller.dispose();
  });

  test('later on the prompt leaves reminders off', () async {
    final config = await _pairedConfig();
    await _addDueTask(config, id: '1', due: now.add(const Duration(hours: 3)));
    final host = MemoryDueReminderHost();
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.reconcile(copy: copy);
    await controller.deferPrompt();
    expect(controller.needsPrompt, isFalse);
    expect(host.scheduled, isEmpty);
    await controller.reconcile(copy: copy);
    expect(controller.needsPrompt, isFalse);
    expect(host.scheduled, isEmpty);
    controller.dispose();
  });

  test('ready pending action notifies once until it leaves ready', () async {
    final config = await _pairedConfig();
    await config.localStore.upsertRecord(
      collection: 'pending_actions',
      recordId: 'mail_reply:9',
      payloadJson: jsonEncode({
        'type': 'mail_reply',
        'status': 'ready',
        'subject': 'Re: Lunch',
        'body': 'See you',
      }),
      updatedAt: '2026-09-07T00:00:00Z',
    );
    final host = MemoryDueReminderHost(permissionGranted: true);
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.acceptPrompt(copy);
    expect(host.shownNow, hasLength(1));
    expect(host.shownNow.single.recordId, 'mail_reply:9');
    expect(host.shownNow.single.title, 'Ready to review');

    await controller.reconcile(copy: copy);
    expect(host.shownNow, hasLength(1));

    await config.localStore.upsertRecord(
      collection: 'pending_actions',
      recordId: 'mail_reply:9',
      payloadJson: jsonEncode({
        'type': 'mail_reply',
        'status': 'confirmed',
        'subject': 'Re: Lunch',
        'body': 'See you',
      }),
      updatedAt: '2026-09-07T12:00:00Z',
    );
    await controller.reconcile(copy: copy);
    expect(host.shownNow, isEmpty);
    controller.dispose();
  });

  test('ready action still notifies when due reminders are off', () async {
    final config = await _pairedConfig();
    await config.localStore.upsertRecord(
      collection: 'pending_actions',
      recordId: 'mail_reply:3',
      payloadJson: jsonEncode({
        'type': 'mail_reply',
        'status': 'ready',
        'subject': 'Re: Hi',
        'body': 'Hello',
      }),
      updatedAt: '2026-09-07T00:00:00Z',
    );
    final host = MemoryDueReminderHost(permissionGranted: true);
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    await controller.acceptPrompt(copy);
    await controller.setEnabled(false, copy);
    expect(host.scheduled, isEmpty);
    expect(host.shownNow.single.recordId, 'mail_reply:3');
    controller.dispose();
  });

  test('ingestWake records type and asks the shell for Tasks', () async {
    final config = await _pairedConfig();
    final host = MemoryDueReminderHost();
    final controller = DueReminderController(
      config: config,
      host: host,
      now: () => now,
    );
    var opened = false;
    controller.addListener(() {
      if (controller.consumeOpenTasks()) opened = true;
    });
    final result = await controller.ingestWake(wakeActionReady);
    expect(result?.openTasks, isTrue);
    expect(opened, isTrue);
    controller.dispose();
  });
}
