import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/app.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/theme/app_theme.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/record_picker.dart';
import 'package:opencrm/features/contacts/contact_picker.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

/// A page with one button that opens the contact picker, as a form of another feature
/// would (an opportunity's contact), and shows what it answered.
Future<void> _pumpPicker(
  WidgetTester tester,
  FakeApi api, {
  String? selectedId,
  String? companyId,
}) async {
  final surface = PhonesVariant.current ?? phone;
  tester.view
    ..physicalSize = surface.size
    ..devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = surface.textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
  addTearDown(() => expect(api.unhandled, isEmpty));
  // The auth controller sets this in the app; here nobody signs in.
  api.serverUrl = testServer;

  PickedRecord? picked;
  await tester.pumpWidget(
    ProviderScope(
      retry: noRetry,
      overrides: [apiClientProvider.overrideWithValue(api)],
      child: MaterialApp(
        theme: surface.dark ? AppTheme.dark() : AppTheme.light(),
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => Column(
              children: [
                TextButton(
                  onPressed: () async {
                    final contact = await showContactPicker(
                      context,
                      selectedId: selectedId,
                      companyId: companyId,
                    );
                    setState(() => picked = contact);
                  },
                  child: const Text('Open'),
                ),
                Text('Picked: ${picked?.id} ${picked?.name}'),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'finds a contact by typing and answers its id and name',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/contacts', (request) {
          return request.query['search'] == 'dana'
              ? page([
                  contactJson(
                    id: 'contact-2',
                    firstName: 'Dana',
                    lastName: 'Okafor',
                    company: null,
                    jobTitle: 'Buyer',
                  ),
                ])
              : page([
                  contactJson(),
                  contactJson(
                    id: 'contact-2',
                    firstName: 'Dana',
                    lastName: 'Okafor',
                    company: null,
                    jobTitle: 'Buyer',
                  ),
                ]);
        });
      await _pumpPicker(tester, api, selectedId: 'contact-1');

      expect(find.text('Choose a contact'), findsOneWidget);
      expect(api.requests.single.query, {
        'page': '1',
        'pageSize': '20',
        'sort': 'name',
        'order': 'asc',
      });
      // The company tells two people of the same name apart; without one, the job.
      expect(find.text('Northwind Logistics'), findsOneWidget);
      expect(find.text('Buyer'), findsOneWidget);
      expect(
        find.descendant(
          of: find.widgetWithText(ListTile, 'Marcus Chen'),
          matching: find.byIcon(Icons.check),
        ),
        findsOneWidget,
      );

      await tester.enterText(find.byType(SearchField), 'dana');
      await tester.pump(SearchField.debounce);
      await tester.pumpAndSettle();
      expect(api.requests.last.query['search'], 'dana');
      expect(find.text('Marcus Chen'), findsNothing);

      await tester.tap(find.text('Dana Okafor'));
      await tester.pumpAndSettle();

      expect(find.text('Choose a contact'), findsNothing);
      expect(find.text('Picked: contact-2 Dana Okafor'), findsOneWidget);
    },
  );

  testWidgets('can be narrowed to one company\'s contacts', (tester) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) => page([contactJson()]));
    await _pumpPicker(tester, api, companyId: 'company-1');

    expect(api.requests.single.query, containsPair('companyId', 'company-1'));
  });

  testWidgets('answers nothing when it is closed', (tester) async {
    final api = FakeApi()..on('GET', '/contacts', (request) => page([]));
    await _pumpPicker(tester, api);

    expect(find.text('No contacts yet'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(find.text('Picked: null null'), findsOneWidget);
  });
}
