import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Guards committed platform files so setup.sh regressions fail CI.
void main() {
  test('iOS Info.plist has OAuth scheme and camera string; no mic', () {
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    expect(plist.contains('<string>exosites</string>'), isTrue);
    expect(plist.contains('NSCameraUsageDescription'), isTrue);
    expect(plist.contains('NSMicrophoneUsageDescription'), isFalse);
  });

  test('AndroidManifest has OAuth intent-filter; no RECORD_AUDIO', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest.contains('android:scheme="exosites"'), isTrue);
    expect(manifest.contains('android:host="oauth"'), isTrue);
    expect(manifest.contains('android:host="tasks"'), isTrue);
    expect(manifest.contains('android:host="actions"'), isTrue);
    expect(manifest.contains('android.permission.POST_NOTIFICATIONS'), isTrue);
    expect(manifest.contains('RECORD_AUDIO'), isFalse);
  });
}
