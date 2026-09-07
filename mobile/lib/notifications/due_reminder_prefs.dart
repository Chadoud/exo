import '../sync/key_value_store.dart';

/// Local reminder toggles. Lock-screen task titles stay off until the user opts in.
class DueReminderPrefs {
  DueReminderPrefs(this._storage);

  final KeyValueStore _storage;

  static const enabledKey = 'due_reminders_enabled';
  static const lockScreenDetailKey = 'due_reminders_lock_screen_detail';
  static const askedKey = 'due_reminders_permission_asked';

  Future<bool> get enabled async => (await _storage.read(enabledKey)) == '1';

  Future<bool> get lockScreenDetail async =>
      (await _storage.read(lockScreenDetailKey)) == '1';

  Future<bool> get asked async => (await _storage.read(askedKey)) == '1';

  Future<void> setEnabled(bool value) =>
      _storage.write(enabledKey, value ? '1' : '0');

  Future<void> setLockScreenDetail(bool value) =>
      _storage.write(lockScreenDetailKey, value ? '1' : '0');

  Future<void> setAsked() => _storage.write(askedKey, '1');

  /// Next account must not inherit lock-screen titles or a skipped prompt.
  Future<void> reset() async {
    await _storage.delete(enabledKey);
    await _storage.delete(lockScreenDetailKey);
    await _storage.delete(askedKey);
  }
}
