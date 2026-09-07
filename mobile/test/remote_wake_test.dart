import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/notifications/remote_wake.dart';
import 'package:exosites_mobile/notifications/sync_debug_log.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

int _dbSerial = 0;

MobileSyncConfig _config() {
  return MobileSyncConfig(
    storage: MemoryKeyValueStore(),
    localStore: LocalBrainStore(
      databasePath: '${Directory.systemTemp.path}/wake_${++_dbSerial}.db',
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(SyncDebugLog.reset);

  test('unknown wake types are ignored', () async {
    expect(await handleRemoteWake(config: _config(), type: 'promo'), isNull);
  });

  test('known wake records debug type and asks for Tasks', () async {
    final config = _config();
    await config.hydrate();
    final result = await handleRemoteWake(config: config, type: wakeActionReady);
    expect(result?.openTasks, isTrue);
    expect(SyncDebugLog.lastWakeType, wakeActionReady);
    expect(SyncDebugLog.lastEvent, contains('wake'));
  });
}
