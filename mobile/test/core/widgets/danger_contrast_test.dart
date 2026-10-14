import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/theme/app_theme.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/snackbars.dart';

/// WCAG contrast ratio of two colours.
double _contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// The colour of [label] on a filled button, and the colour of the button.
(Color, Color) _button(WidgetTester tester, String label) {
  final style = tester
      .widget<FilledButton>(
        find.ancestor(
          of: find.text(label),
          matching: find.byType(FilledButton),
        ),
      )
      .style!;
  return (
    style.foregroundColor!.resolve({})!,
    style.backgroundColor!.resolve({})!,
  );
}

/// The colour of the snack bar's [label], and the colour of the bar.
(Color, Color) _snackBar(WidgetTester tester, String label) {
  return (
    tester.widget<Text>(find.text(label)).style!.color!,
    tester.widget<SnackBar>(find.byType(SnackBar)).backgroundColor!,
  );
}

void main() {
  for (final (name, theme) in [
    ('light', AppTheme.light()),
    ('dark', AppTheme.dark()),
  ]) {
    group('in the $name theme the red buttons and messages are readable', () {
      testWidgets('a destructive submit button', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Scaffold(
              body: SubmitButton(
                label: 'Mark as lost',
                saving: false,
                destructive: true,
                onPressed: () {},
              ),
            ),
          ),
        );

        final (text, background) = _button(tester, 'Mark as lost');
        expect(_contrast(text, background), greaterThanOrEqualTo(4.5));
      });

      testWidgets('a destructive confirmation', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Builder(
              builder: (context) => TextButton(
                onPressed: () => showConfirmDialog(
                  context,
                  title: 'Delete?',
                  message: 'This cannot be undone.',
                  confirmLabel: 'Delete lead',
                  destructive: true,
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();

        final (text, background) = _button(tester, 'Delete lead');
        expect(_contrast(text, background), greaterThanOrEqualTo(4.5));
      });

      testWidgets('an error message', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showErrorSnackBar(context, 'It failed.'),
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();

        final (text, background) = _snackBar(tester, 'It failed.');
        expect(_contrast(text, background), greaterThanOrEqualTo(4.5));
      });
    });
  }
}
