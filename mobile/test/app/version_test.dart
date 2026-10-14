import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/features/more/more_screen.dart';

void main() {
  test('the version on the More tab is the version of pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final version = RegExp(
      r'^version:\s*([^+\s]+)',
      multiLine: true,
    ).firstMatch(pubspec)?.group(1);

    expect(appVersion, version);
  });
}
