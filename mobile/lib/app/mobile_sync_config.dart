import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import 'exo_config.dart';
import '../sync/cloud_api.dart';
import '../sync/key_value_store.dart';
import '../sync/local_store.dart';
import '../sync/pairing_cloud_url.dart';
import '../sync/sync_engine.dart';
import '../sync/sync_errors.dart';
import '../sync/sync_failure.dart';

/// Shared sync + auth configuration persisted in secure storage.
class MobileSyncConfig extends ChangeNotifier {
  MobileSyncConfig({
    KeyValueStore? storage,
    http.Client? httpClient,
    LocalBrainStore? localStore,
  })  : _storage = storage ?? FlutterSecureKeyValueStore(),
        _http = httpClient ?? http.Client(),
        _localStore = localStore ?? LocalBrainStore();

  final KeyValueStore _storage;
  final http.Client _http;
  final LocalBrainStore _localStore;
  static const _uuid = Uuid();

  static const _hasEverSyncedKey = 'has_ever_synced';

  String _cloudUrlSync = ExoConfig.cloudUrl;
  String _tokenSync = '';
  String _deviceIdSync = '';
  bool _paired = false;
  bool _crashReportsOptIn = false;
  bool _onboardingComplete = false;
  int _dataEpoch = 0;
  String? _lastSyncLabel;
  bool _hasEverSynced = false;
  int _cachedRecordCount = 0;
  int _cachedMemoryCount = 0;
  bool _syncInFlight = false;
  SyncFailureBanner? _lastError;
  Future<SyncPullResult>? _syncInFlightFuture;
  Future<bool>? _refreshInFlight;

  String get cloudUrlSync => _cloudUrlSync;
  String get accessTokenSync => _tokenSync;
  String get deviceIdSync => _deviceIdSync;
  bool get isPaired => _paired;
  bool get crashReportsOptIn => _crashReportsOptIn;
  bool get onboardingComplete => _onboardingComplete;
  int get dataEpoch => _dataEpoch;
  /// Display string for last successful sync (Settings / legacy).
  String? get lastSyncLabel => _lastSyncLabel;
  /// True only after at least one successful pull (empty-state classification).
  bool get hasEverSynced => _hasEverSynced;
  int get cachedRecordCount => _cachedRecordCount;
  int get cachedMemoryCount => _cachedMemoryCount;
  /// True while [syncNow] is running (shell auto-pull or user refresh).
  bool get syncInFlight => _syncInFlight;
  /// Last failed pull (shell auto-pull and tab refresh share this).
  SyncFailureBanner? get lastError => _lastError;
  LocalBrainStore get localStore => _localStore;
  KeyValueStore get storage => _storage;

  bool get isSignedIn => _tokenSync.isNotEmpty;
  bool get isConfigured =>
      _cloudUrlSync.isNotEmpty && _tokenSync.isNotEmpty && _paired;

  /// Show guided setup until signed in, paired (or dev skip), and first-sync finished.
  bool get needsOnboarding {
    if (!isSignedIn) return true;
    if (!_paired) {
      if (ExoConfig.allowDevSkipPair && _onboardingComplete) return false;
      return true;
    }
    return !_onboardingComplete;
  }

  String get syncReadyLabel {
    if (!isSignedIn) return 'Not signed in';
    if (!_paired) return 'Signed in — pair with desktop to sync';
    return 'Ready to sync';
  }

  CloudApi get api => CloudApi(
        baseUrl: _cloudUrlSync.replaceAll(RegExp(r'/$'), ''),
        accessToken: () => _tokenSync,
        onUnauthorized: refreshSession,
        httpClient: _http,
      );

  SyncEngine get engine => SyncEngine(
        cloudUrl: _cloudUrlSync,
        accessToken: _tokenSync,
        deviceId: _deviceIdSync,
        api: api,
        storage: _storage,
        localStore: _localStore,
      );

  Future<void> hydrate() async {
    _cloudUrlSync = await _storage.read('cloud_url') ?? ExoConfig.cloudUrl;
    _tokenSync = await _storage.read('access_token') ?? '';
    _paired = (await _storage.read('sync_paired')) == '1';
    _crashReportsOptIn = (await _storage.read('crash_reports_opt_in')) == '1';
    _onboardingComplete = (await _storage.read('setup_onboarding_complete')) == '1';
    _lastSyncLabel = await _storage.read('last_sync_label');
    final everFlag = await _storage.read(_hasEverSyncedKey);
    // Migrate: prior successful sync wrote last_sync_label only.
    _hasEverSynced = everFlag == '1' || (_lastSyncLabel != null && _lastSyncLabel!.isNotEmpty);
    var deviceId = await _storage.read('device_id');
    // Cloud relay stores device_id as CHAR(36); migrate legacy `mobile-{uuid}` ids.
    if (deviceId == null || deviceId.isEmpty || deviceId.length > 36) {
      deviceId = _uuid.v4();
      await _storage.write('device_id', deviceId);
    }
    _deviceIdSync = deviceId;
    await _refreshCounts();
    if (isConfigured && !_onboardingComplete && _cachedRecordCount > 0) {
      _onboardingComplete = true;
      await _storage.write('setup_onboarding_complete', '1');
    }
    notifyListeners();
  }

  Future<void> _refreshCounts() async {
    try {
      _cachedRecordCount = await _localStore.countAll();
      _cachedMemoryCount = await _localStore.countByCollection('memory_entries');
    } catch (_) {
      _cachedRecordCount = 0;
      _cachedMemoryCount = 0;
    }
  }

  Future<void> saveSession({
    required String accessToken,
    String? refreshToken,
    String? cloudUrl,
  }) async {
    _tokenSync = accessToken;
    if (refreshToken != null) {
      await _storage.write('refresh_token', refreshToken);
    }
    if (cloudUrl != null && cloudUrl.isNotEmpty) {
      _cloudUrlSync = cloudUrl;
      await _storage.write('cloud_url', cloudUrl);
    }
    await _storage.write('access_token', accessToken);
    notifyListeners();
  }

  /// Refresh access token; single-flight. Returns false and clears session on failure.
  Future<bool> refreshSession() async {
    if (_refreshInFlight != null) return _refreshInFlight!;
    _refreshInFlight = _refreshSessionImpl();
    try {
      return await _refreshInFlight!;
    } finally {
      _refreshInFlight = null;
    }
  }

  Future<bool> _refreshSessionImpl() async {
    final refresh = await _storage.read('refresh_token');
    if (refresh == null || refresh.isEmpty) {
      await clearSession();
      return false;
    }
    final base = _cloudUrlSync.replaceAll(RegExp(r'/$'), '');
    try {
      final res = await _http.post(
        Uri.parse('$base/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refresh_token': refresh}),
      );
      if (res.statusCode >= 400) {
        await clearSession();
        return false;
      }
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final access = data['access_token'] as String?;
      if (access == null || access.isEmpty) {
        await clearSession();
        return false;
      }
      await saveSession(
        accessToken: access,
        refreshToken: data['refresh_token'] as String?,
      );
      return true;
    } catch (_) {
      await clearSession();
      return false;
    }
  }

  /// Apply desktop QR / clipboard pairing payload (master key + optional cloud URL).
  ///
  /// Clears pull cursor and local cache so a re-pair never decrypts old blobs
  /// with a new key or skips pages via a stale cursor.
  Future<void> applyPairingPayload(Map<String, dynamic> payload) async {
    final mk = payload['master_key_b64'] as String?;
    if (mk == null || mk.isEmpty) {
      throw ArgumentError('pairing payload missing master_key_b64');
    }
    await _storage.write('exosites_sync_master_key_b64', mk);
    final url = payload['cloud_url'] as String?;
    if (url != null && url.isNotEmpty) {
      if (!isAllowedPairingCloudUrl(url)) {
        throw ArgumentError('pairing payload cloud_url not allowed');
      }
      final normalized = url.trim().replaceAll(RegExp(r'/$'), '');
      _cloudUrlSync = normalized;
      await _storage.write('cloud_url', normalized);
    }
    await _storage.write('sync_paired', '1');
    await _storage.delete('setup_onboarding_complete');
    await _storage.delete(SyncEngine.cursorStorageKey);
    await _storage.delete('last_sync_label');
    await _storage.delete(_hasEverSyncedKey);
    try {
      await _localStore.clearAll();
    } catch (_) {}
    _lastSyncLabel = null;
    _hasEverSynced = false;
    _lastError = null;
    _cachedRecordCount = 0;
    _cachedMemoryCount = 0;
    _paired = true;
    _onboardingComplete = false;
    _dataEpoch++;
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    _onboardingComplete = true;
    await _storage.write('setup_onboarding_complete', '1');
    notifyListeners();
  }

  /// Debug/dev: finish setup without a desktop master key (sync stays unavailable).
  Future<void> completeOnboardingSkippingPair() async {
    if (!ExoConfig.allowDevSkipPair) {
      throw StateError('Dev skip pairing is not allowed in this build');
    }
    await completeOnboarding();
  }

  Future<void> registerDeviceIfNeeded() async {
    if (!isConfigured) return;
    final platform = Platform.isIOS ? 'ios' : 'android';
    await api.registerDevice(
      deviceId: _deviceIdSync,
      name: Platform.isIOS ? 'iPhone' : 'Android',
      platform: platform,
    );
  }

  Future<void> setCrashReportsOptIn(bool enabled) async {
    _crashReportsOptIn = enabled;
    await _storage.write('crash_reports_opt_in', enabled ? '1' : '0');
    notifyListeners();
  }

  void clearLastError() {
    if (_lastError == null) return;
    _lastError = null;
    notifyListeners();
  }

  /// Pull from cloud — single-flight (shell auto-pull and pull-to-refresh share one Future).
  Future<SyncPullResult> syncNow() async {
    if (_syncInFlightFuture != null) return _syncInFlightFuture!;
    final run = _syncNowImpl();
    _syncInFlightFuture = run;
    try {
      return await run;
    } finally {
      if (identical(_syncInFlightFuture, run)) {
        _syncInFlightFuture = null;
      }
    }
  }

  Future<SyncPullResult> _syncNowImpl() async {
    if (!isSignedIn) {
      final e = SyncAuthException('not signed in');
      _lastError = describeSyncFailure(e);
      notifyListeners();
      throw e;
    }
    if (!_paired) {
      final e = SyncNotPairedException();
      _lastError = describeSyncFailure(e);
      notifyListeners();
      throw e;
    }
    _syncInFlight = true;
    clearLastError();
    notifyListeners();
    try {
      final result = await engine.pullUntilCaughtUp();
      await _refreshCounts();
      _lastSyncLabel = DateTime.now().toLocal().toString().split('.').first;
      await _storage.write('last_sync_label', _lastSyncLabel!);
      _hasEverSynced = true;
      await _storage.write(_hasEverSyncedKey, '1');
      _lastError = null;
      _dataEpoch++;
      notifyListeners();
      return result;
    } on CloudApiException catch (e) {
      if (e.isUnauthorized) {
        final mapped = SyncAuthException();
        _lastError = describeSyncFailure(mapped);
        notifyListeners();
        throw mapped;
      }
      final mapped = SyncNetworkException(e.isNetwork ? e.body : '');
      _lastError = describeSyncFailure(mapped);
      notifyListeners();
      throw mapped;
    } catch (e) {
      _lastError = describeSyncFailure(e);
      notifyListeners();
      rethrow;
    } finally {
      _syncInFlight = false;
      notifyListeners();
    }
  }

  /// Drop pairing + local sync cache; keep sign-in so the user can paste a fresh code.
  Future<void> clearPairing() async {
    await _storage.delete('exosites_sync_master_key_b64');
    await _storage.delete('sync_paired');
    await _storage.delete(SyncEngine.cursorStorageKey);
    await _storage.delete('last_sync_label');
    await _storage.delete(_hasEverSyncedKey);
    await _storage.delete('setup_onboarding_complete');
    _paired = false;
    _onboardingComplete = false;
    _lastSyncLabel = null;
    _hasEverSynced = false;
    _lastError = null;
    _cachedRecordCount = 0;
    _cachedMemoryCount = 0;
    try {
      await _localStore.clearAll();
    } catch (_) {}
    _dataEpoch++;
    notifyListeners();
  }

  /// Full wipe — tokens, master key, pairing, cursor, and on-disk brain DB.
  Future<void> clearSession() async {
    await _storage.delete('access_token');
    await _storage.delete('refresh_token');
    await _storage.delete('cloud_url');
    _tokenSync = '';
    _cloudUrlSync = ExoConfig.cloudUrl;
    await clearPairing();
    try {
      await _localStore.wipeDatabase();
    } catch (_) {}
  }
}
