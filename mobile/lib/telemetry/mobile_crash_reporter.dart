import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../app/exo_config.dart';

/// Opt-in crash forwarding to the cloud relay (same contract as desktop).
class MobileCrashReporter {
  static const defaultIngestUrl = 'https://api.exosites.ch/v1/crash-reports';

  MobileCrashReporter({
    this.crashIngestUrl = const String.fromEnvironment(
      'EXOSITES_CRASH_INGEST_URL',
      defaultValue: defaultIngestUrl,
    ),
    this.crashIngestToken = const String.fromEnvironment(
      'EXOSITES_CRASH_INGEST_TOKEN',
      defaultValue: '',
    ),
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String crashIngestUrl;
  final String crashIngestToken;
  final http.Client _http;

  bool _optIn = false;
  bool _installed = false;

  bool get isConfigured =>
      crashIngestUrl.trim().isNotEmpty && crashIngestToken.trim().isNotEmpty;

  /// True when the crash ingest token is baked into this build.
  static bool get isBuildConfigured {
    const token = String.fromEnvironment(
      'EXOSITES_CRASH_INGEST_TOKEN',
      defaultValue: '',
    );
    return token.trim().isNotEmpty;
  }

  bool get optIn => _optIn;

  /// Wire Flutter / platform error hooks once per process.
  void install({required bool optIn}) {
    _optIn = optIn;
    if (_installed) return;
    _installed = true;

    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      unawaited(reportFlutterError(details));
    };

    PlatformDispatcher.instance.onError = (error, stack) {
      unawaited(reportError(error, stack));
      return true;
    };
  }

  void setOptIn(bool value) {
    _optIn = value;
  }

  Future<void> reportFlutterError(FlutterErrorDetails details) async {
    final message = details.exceptionAsString();
    final stack = details.stack?.toString() ?? '';
    await _sendReport(message, stack, source: 'flutter');
  }

  Future<void> reportError(
    Object error,
    StackTrace? stack, {
    String source = 'dart',
  }) async {
    await _sendReport(error.toString(), stack?.toString() ?? '', source: source);
  }

  Future<void> _sendReport(
    String errorMessage,
    String stackTrace, {
    required String source,
  }) async {
    if (!_optIn || !isConfigured) return;

    final platform = Platform.isIOS ? 'ios' : 'android';
    final body = jsonEncode({
      'app_version': ExoConfig.appVersion,
      'environment': ExoConfig.flavor,
      'ui_locale': Platform.localeName.split('_').first,
      'platform': platform,
      'source': source,
      'error_message': truncateForIngest(errorMessage, 8000),
      'stack_trace': truncateForIngest(stackTrace, 65000),
    });

    try {
      final res = await _http.post(
        Uri.parse(crashIngestUrl.trim()),
        headers: {
          'Content-Type': 'application/json',
          'X-Crash-Token': crashIngestToken.trim(),
        },
        body: body,
      );
      if (res.statusCode >= 400 && kDebugMode) {
        debugPrint('MobileCrashReporter: ingest failed (${res.statusCode})');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('MobileCrashReporter: ingest error $e');
      }
    }
  }

  void dispose() {
    _http.close();
  }
}

/// Truncate crash payload fields to cloud-node limits.
String truncateForIngest(String value, int maxLen) {
  if (value.length <= maxLen) return value;
  return value.substring(0, maxLen);
}
