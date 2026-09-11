import '../../sync/key_value_store.dart';

/// Device-local first-run sources ack. Not stored on [MobileSyncConfig].
class SetupSourcesAck {
  SetupSourcesAck({KeyValueStore? store})
      : _store = store ?? FlutterSecureKeyValueStore();

  static const storageKey = 'setup_sources_ack';

  final KeyValueStore _store;
  bool acknowledged = false;
  bool loaded = false;

  Future<void> hydrate() async {
    acknowledged = (await _store.read(storageKey)) == '1';
    loaded = true;
  }

  Future<void> mark() async {
    await _store.write(storageKey, '1');
    acknowledged = true;
    loaded = true;
  }
}
