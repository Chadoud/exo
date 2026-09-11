import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/app/exo_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('production release never enables first-run or pair skip', () {
    expect(
      ExoConfig.resolveDevSkip(
        releaseMode: true,
        flavorName: 'production',
        debugMode: false,
        defineEnabled: true,
      ),
      isFalse,
    );
  });

  test('debug enables first-run skip without a dart-define', () {
    expect(
      ExoConfig.resolveDevSkip(
        releaseMode: false,
        flavorName: 'production',
        debugMode: true,
        defineEnabled: false,
      ),
      isTrue,
    );
  });

  test('production.json does not set EXOSITES_DEV_SKIP_FIRST_RUN', () {
    final file = File('env/production.json');
    expect(file.existsSync(), isTrue);
    final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    expect(json.containsKey('EXOSITES_DEV_SKIP_FIRST_RUN'), isFalse);
    expect(json.containsKey('EXOSITES_DEV_SKIP_PAIR'), isFalse);
  });
}
