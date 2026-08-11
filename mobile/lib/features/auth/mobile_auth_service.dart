import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../app/exo_config.dart';
import '../../sync/user_messages.dart';
import '../../app/mobile_sync_config.dart';

/// Handles mobile OAuth deep links + email/password against the cloud API.
class MobileAuthService {
  MobileAuthService({
    required this.config,
    AppLinks? appLinks,
    http.Client? httpClient,
    void Function(String message)? onError,
  })  : _appLinksOverride = appLinks,
        _http = httpClient ?? http.Client(),
        _onError = onError;

  final MobileSyncConfig config;
  final AppLinks? _appLinksOverride;
  AppLinks? _appLinks;
  final http.Client _http;
  final void Function(String message)? _onError;
  StreamSubscription<Uri>? _sub;

  AppLinks get _links => _appLinks ??= _appLinksOverride ?? AppLinks();

  String get _base => config.cloudUrlSync.replaceAll(RegExp(r'/$'), '');

  /// Last auth error for UI (Settings / snackbars).
  final ValueNotifier<String?> lastError = ValueNotifier<String?>(null);

  Future<void> startListening() async {
    try {
      final initial = await _links.getInitialLink();
      if (initial != null) {
        await _handleUri(initial);
      }
    } catch (e) {
      _reportError(SyncUserMessages.signInFailed);
    }
    await _sub?.cancel();
    _sub = _links.uriLinkStream.listen(
      (uri) {
        unawaited(_handleUri(uri));
      },
      onError: (_) => _reportError(SyncUserMessages.signInFailed),
    );
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    lastError.dispose();
  }

  Future<void> _handleUri(Uri uri) async {
    if (uri.scheme != 'exosites' || uri.host != 'oauth') return;
    final code = uri.queryParameters['exo_code'];
    if (code == null || code.isEmpty) return;
    try {
      await exchangeCode(code);
      lastError.value = null;
    } catch (_) {
      _reportError(SyncUserMessages.signInFailed);
    }
  }

  Future<void> exchangeCode(String code) async {
    final res = await _http.post(
      Uri.parse('$_base/auth/exchange'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'code': code}),
    );
    if (res.statusCode >= 400) {
      throw Exception('Sign-in failed');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await _persistTokens(data);
  }

  /// Email + password login (same contract as desktop cloud auth).
  Future<void> loginWithPassword({
    required String email,
    required String password,
  }) async {
    final res = await _http.post(
      Uri.parse('$_base/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email.trim(), 'password': password}),
    );
    if (res.statusCode >= 400) {
      throw Exception(_detailFromBody(res.body) ?? 'login_failed');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await _persistTokens(data);
    lastError.value = null;
  }

  /// Create account then session (for first-time email users).
  /// The cloud requires first/last name at registration (422 without them).
  Future<void> registerWithPassword({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) async {
    final res = await _http.post(
      Uri.parse('$_base/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email.trim(),
        'password': password,
        'first_name': firstName.trim(),
        'last_name': lastName.trim(),
      }),
    );
    if (res.statusCode >= 400) {
      throw Exception(_detailFromBody(res.body) ?? 'register_failed');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await _persistTokens(data);
    lastError.value = null;
  }

  Future<void> _persistTokens(Map<String, dynamic> data) async {
    await config.saveSession(
      accessToken: data['access_token'] as String,
      refreshToken: data['refresh_token'] as String?,
      cloudUrl: _base.isNotEmpty ? _base : ExoConfig.cloudUrl,
    );
    try {
      await config.registerDeviceIfNeeded();
    } catch (_) {
      // Pairing may not exist yet; device register runs after scan.
    }
  }

  /// Returns true when [uri] is a mobile OAuth callback with a code.
  static bool isOAuthCallback(Uri uri) {
    return uri.scheme == 'exosites' &&
        uri.host == 'oauth' &&
        (uri.queryParameters['exo_code']?.isNotEmpty ?? false);
  }

  Uri googleSignInUri() => Uri.parse('$_base/auth/mobile/start/google');

  Uri appleSignInUri() => Uri.parse('$_base/auth/mobile/start/apple');

  /// Lightweight reachability check before opening the system browser.
  Future<bool> cloudReachable() async {
    try {
      final res = await _http.get(Uri.parse('$_base/health')).timeout(const Duration(seconds: 6));
      return res.statusCode >= 200 && res.statusCode < 500;
    } catch (_) {
      return false;
    }
  }

  static String? _detailFromBody(String body) {
    try {
      final data = jsonDecode(body) as Map<String, dynamic>;
      return data['detail']?.toString();
    } catch (_) {
      return null;
    }
  }

  void _reportError(String message) {
    lastError.value = message;
    _onError?.call(message);
    if (kDebugMode) {
      debugPrint('MobileAuthService: $message');
    }
  }
}
