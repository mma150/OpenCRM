import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/widgets/status_badge.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _opportunityPath = Routes.opportunity('opp-1');
final _quotePath = Routes.quote('opp-1', 'quote-1');

final _pdfBytes = Uint8List.fromList([37, 80, 68, 70, 45, 49, 46, 55]);

ApiFile _pdf({String? fileName = 'Q-0001.pdf'}) {
  return ApiFile(
    bytes: _pdfBytes,
    contentType: 'application/pdf',
    fileName: fileName,
  );
}

/// An opportunity's page and the pages under it (the board), with [quotes] in its Quotes
/// card and [quote] behind `GET /quotes/quote-1`.
FakeApi _api({
  List<Map<String, Object?>>? quotes,
  int? total,
  Map<String, Object?>? quote,
  List<Map<String, Object?>> timeline = const [],
}) {
  return FakeApi()
    ..on(
      'GET',
      '/opportunities/board',
      (request) => boardJson([opportunityJson()]),
    )
    ..on('GET', '/opportunities/opp-1', (request) => opportunityJson())
    ..on('GET', '/opportunities/opp-1/timeline', (request) => page(timeline))
    ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson())
    ..on(
      'GET',
      '/quotes',
      (request) => page(quotes ?? [quoteJson()], total: total),
    )
    ..on('GET', '/quotes/quote-1', (request) => quote ?? quoteJson());
}

Future<void> _openQuotesCard(WidgetTester tester) {
  return scrollTo(tester, find.text('Quotes'));
}

void main() {
  group('the Quotes card of an opportunity', () {
    testWidgets(
      'lists its quotes with status, total and valid until',
      variant: phones,
      (tester) async {
        final api = _api(
          quotes: [
            quoteJson(status: 'EXPIRED', total: 12500.5),
            quoteJson(
              id: 'quote-2',
              number: 'Q-0002',
              status: 'ACCEPTED',
              validUntil: null,
            ),
          ],
        );
        await pumpApp(tester, api: api, user: rep, location: _opportunityPath);

        await _openQuotesCard(tester);
        await scrollTo(tester, find.text('Q-0002'));
        expect(find.text('Q-0001'), findsOneWidget);
        expect(find.widgetWithText(StatusBadge, 'Expired'), findsOneWidget);
        expect(find.widgetWithText(StatusBadge, 'Accepted'), findsOneWidget);
        expect(
          find.text(r'$12,500.50 · Valid until Nov 4, 2026'),
          findsOneWidget,
        );
        expect(find.text(r'$2,700'), findsOneWidget);
        expect(find.text('2 total'), findsOneWidget);
        // Quotes are made in the web app: nothing here makes one.
        expect(find.text('New quote'), findsNothing);

        final query = api.sent('GET', '/quotes').last.query;
        expect(query['opportunityId'], 'opp-1');
        expect(query['sort'], 'createdAt');
        expect(query['order'], 'desc');
        expect(query['pageSize'], '10');
        expect(query['tz'], deviceTimeZone());
      },
    );

    testWidgets(
      'says where quotes are made when there is none',
      variant: phones,
      (tester) async {
        await pumpApp(
          tester,
          api: _api(quotes: []),
          user: rep,
          location: _opportunityPath,
        );

        await scrollTo(tester, find.textContaining('No quotes yet'));
        expect(
          find.text('No quotes yet. Quotes are created in the web app.'),
          findsOneWidget,
        );
      },
    );

    testWidgets('a Read-only user sees the quotes too', variant: phones, (
      tester,
    ) async {
      await pumpApp(
        tester,
        api: _api(),
        user: readOnly,
        location: _opportunityPath,
      );

      await scrollTo(tester, find.text('Q-0001'));
      expect(find.widgetWithText(StatusBadge, 'Draft'), findsOneWidget);
    });

    testWidgets('says when there are more than it shows', (tester) async {
      await pumpApp(
        tester,
        api: _api(total: 12),
        user: rep,
        location: _opportunityPath,
      );

      await scrollTo(tester, find.textContaining('Showing the newest'));
      expect(
        find.text('Showing the newest 1 of 12. The others are in the web app.'),
        findsOneWidget,
      );
    });

    testWidgets('a failure says why, and Retry asks again', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/quotes', (request) => throw apiError('INTERNAL_ERROR'));
      await pumpApp(tester, api: api, user: rep, location: _opportunityPath);

      await scrollTo(
        tester,
        find.textContaining('The server ran into a problem'),
      );
      api.on('GET', '/quotes', (request) => page([quoteJson()]));
      await tapVisible(
        tester,
        find.widgetWithText(OutlinedButton, 'Retry').first,
      );

      await scrollTo(tester, find.text('Q-0001'));
      expect(find.text('Q-0001'), findsOneWidget);
    });

    testWidgets('a quote opens its page, under the opportunity', (
      tester,
    ) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: _opportunityPath,
      );

      await tapVisible(tester, find.text('Q-0001'));

      expect(app.location, _quotePath);
      expect(find.text('Quote Q-0001'), findsOneWidget);
      // Back leads to the opportunity.
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(app.location, _opportunityPath);
    });
  });

  group('the quote', () {
    testWidgets(
      'shows the document: dates, buyer, lines, totals, notes and terms',
      variant: phones,
      (tester) async {
        final api = _api(
          quote: quoteJson(
            status: 'SENT',
            sentAt: '2026-10-06T10:00:00.000Z',
            lines: [
              quoteLineJson(),
              quoteLineJson(
                id: 'line-2',
                description: 'Installation on site, per vehicle',
                quantity: 12,
                unitPrice: 85.5,
                discountPercent: 10,
                taxRate: 0,
                lineTotal: 923.4,
              ),
            ],
            discountType: 'PERCENT',
            discountValue: 5,
            subtotal: 3423.4,
            discountTotal: 171.17,
            taxTotal: 190,
            total: 3442.23,
            notes: 'Delivery in two weeks.',
            terms: 'Payment within 30 days.',
            invoice: {'id': 'invoice-1', 'number': 'INV-0001'},
          ),
        );
        await pumpApp(tester, api: api, user: rep, location: _quotePath);

        expect(find.text('Quote Q-0001'), findsOneWidget);
        expect(find.widgetWithText(StatusBadge, 'Sent'), findsOneWidget);
        expect(find.text('Fleet renewal'), findsWidgets);
        expect(find.text(r'$3,442.23'), findsWidgets);
        expect(find.text('Oct 5, 2026'), findsOneWidget);
        expect(find.text('Nov 4, 2026'), findsOneWidget);
        expect(find.text('Oct 6, 2026'), findsOneWidget);
        expect(find.text('INV-0001'), findsOneWidget);

        await scrollTo(tester, find.text('marcus@northwind.example'));
        expect(find.text('Marcus Chen'), findsOneWidget);
        expect(find.text('Northwind Logistics'), findsOneWidget);

        // Each line stacked: description, quantity × price, discount, tax, line total.
        await scrollTo(tester, find.text('Installation on site, per vehicle'));
        expect(find.text(r'2 × $1,250 · 8% tax'), findsOneWidget);
        expect(
          find.text(r'12 × $85.50 · 10% discount · 0% tax'),
          findsOneWidget,
        );
        expect(find.text(r'$923.40'), findsOneWidget);

        await scrollTo(tester, find.text('Discount (5%)'));
        expect(find.text(r'$3,423.40'), findsOneWidget);
        expect(find.text(r'−$171.17'), findsOneWidget);
        expect(find.text(r'$190'), findsOneWidget);

        await scrollTo(tester, find.text('Payment within 30 days.'));
        expect(find.text('Delivery in two weeks.'), findsOneWidget);
        expect(api.sent('GET', '/quotes/quote-1').single.query, {
          'tz': deviceTimeZone(),
        });
      },
    );

    testWidgets('a draft without lines or buyer says so', variant: phones, (
      tester,
    ) async {
      final api = _api(
        quote: quoteJson(
          lines: [],
          contact: null,
          company: null,
          subtotal: 0,
          taxTotal: 0,
          total: 0,
        ),
      );
      await pumpApp(tester, api: api, user: rep, location: _quotePath);

      await scrollTo(
        tester,
        find.text(
          'Add at least one line in the web app before you send this quote.',
        ),
      );
      // Nothing to send yet; the PDF can still be shared.
      expect(find.text('Email quote'), findsNothing);
      expect(find.text('Share PDF'), findsOneWidget);
      await scrollTo(tester, find.text('No contact or company.'));
      await scrollTo(tester, find.textContaining('No line items yet.'));
    });

    testWidgets(
      'a quote that cannot be read says why, with Retry',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'GET',
            '/quotes/quote-1',
            (request) => throw apiError('NOT_FOUND'),
          );
        await pumpApp(tester, api: api, user: rep, location: _quotePath);

        expect(
          find.text('This no longer exists. Go back and refresh the list.'),
          findsOneWidget,
        );
        api.on('GET', '/quotes/quote-1', (request) => quoteJson());
        await tapVisible(tester, find.text('Retry'));
        expect(find.text('Quote Q-0001'), findsOneWidget);
      },
    );
  });

  group('who may email it', () {
    Future<void> pump(WidgetTester tester, User user, String status) {
      return pumpApp(
        tester,
        api: _api(quote: quoteJson(status: status)),
        user: user,
        location: _quotePath,
      );
    }

    testWidgets('Read-only shares the PDF only', variant: phones, (
      tester,
    ) async {
      await pump(tester, readOnly, 'SENT');

      expect(find.text('Share PDF'), findsOneWidget);
      expect(find.text('Email quote'), findsNothing);
      expect(find.textContaining('in the web app'), findsNothing);
    });

    for (final user in [admin, manager, rep]) {
      for (final status in ['DRAFT', 'SENT', 'EXPIRED']) {
        testWidgets('${user.role.label} emails a quote that is $status', (
          tester,
        ) async {
          await pump(tester, user, status);

          expect(find.text('Email quote'), findsOneWidget);
          expect(find.text('Share PDF'), findsOneWidget);
        });
      }
    }

    for (final status in ['ACCEPTED', 'DECLINED']) {
      testWidgets('nobody emails a quote that is $status', variant: phones, (
        tester,
      ) async {
        await pump(tester, admin, status);

        expect(find.text('Email quote'), findsNothing);
        expect(find.text('Share PDF'), findsOneWidget);
      });
    }
  });

  group('Share PDF', () {
    testWidgets(
      'downloads the PDF with a progress indicator, then shares it',
      variant: phones,
      (tester) async {
        final answer = Completer<Object?>();
        final api = _api()
          ..on('GET', '/quotes/quote-1/pdf', (request) => answer.future);
        final app = await pumpApp(
          tester,
          api: api,
          user: readOnly,
          location: _quotePath,
        );

        await tester.tap(find.text('Share PDF'));
        await tester.pump();

        expect(find.text('Preparing PDF...'), findsOneWidget);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        // Pressing again sends nothing more.
        await tester.tap(find.text('Preparing PDF...'), warnIfMissed: false);
        expect(api.sent('GET', '/quotes/quote-1/pdf'), hasLength(1));

        answer.complete(_pdf());
        await tester.pumpAndSettle();

        final shared = app.sharer.shared.single;
        expect(shared.bytes, _pdfBytes);
        expect(shared.fileName, 'Q-0001.pdf');
        expect(shared.mimeType, 'application/pdf');
        expect(shared.origin, isNotNull);
        expect(find.text('Share PDF'), findsOneWidget);
      },
    );

    testWidgets('names the file by the quote when the server gives no name', (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/quotes/quote-1/pdf', (request) => _pdf(fileName: null));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: _quotePath,
      );

      await tapVisible(tester, find.text('Share PDF'));

      expect(app.sharer.shared.single.fileName, 'Q-0001.pdf');
    });

    testWidgets(
      'a failed download says why and shares nothing',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'GET',
            '/quotes/quote-1/pdf',
            (request) => throw apiError(ApiError.network),
          );
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: _quotePath,
        );

        await tapVisible(tester, find.text('Share PDF'));

        expect(
          find.text(
            'The PDF could not be downloaded. The server cannot be reached. Check your '
            'connection and try again.',
          ),
          findsOneWidget,
        );
        expect(app.sharer.shared, isEmpty);
        expect(find.text('Share PDF'), findsOneWidget);
      },
    );

    testWidgets('an answer that is not a PDF is not shared', (tester) async {
      final api = _api()
        ..on(
          'GET',
          '/quotes/quote-1/pdf',
          (request) => ApiFile(
            bytes: Uint8List.fromList([60, 104]),
            contentType: 'text/html',
          ),
        );
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: _quotePath,
      );

      await tapVisible(tester, find.text('Share PDF'));

      expect(find.textContaining('could not read'), findsOneWidget);
      expect(app.sharer.shared, isEmpty);
    });

    testWidgets('a share sheet that does not open says so', (tester) async {
      final api = _api()..on('GET', '/quotes/quote-1/pdf', (request) => _pdf());
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: _quotePath,
      );
      app.sharer.error = Exception('no activity');

      await tapVisible(tester, find.text('Share PDF'));

      expect(
        find.text('The share sheet could not be opened. Try again.'),
        findsOneWidget,
      );
    });
  });

  group('the timeline links to the quote', () {
    testWidgets(
      'from a status change and from the email it was sent with',
      variant: phones,
      (tester) async {
        final api = _api(
          timeline: [
            entryJson(
              id: 'entry-1',
              kind: 'QUOTE_STATUS',
              body: null,
              details: {
                'quote': {'id': 'quote-1', 'number': 'Q-0001'},
                'from': 'DRAFT',
                'to': 'SENT',
                'total': 2700,
              },
            ),
            entryJson(
              id: 'entry-2',
              kind: 'EMAIL',
              body: 'Hello Marcus',
              details: {
                'subject': 'Quote Q-0001 from Riley Rep',
                'quote': {'id': 'quote-1', 'number': 'Q-0001'},
              },
            ),
            entryJson(
              id: 'entry-3',
              kind: 'QUOTE_STATUS',
              body: null,
              details: {
                'quote': {'id': 'quote-9', 'number': 'Q-0009'},
                'from': 'DRAFT',
                'to': null,
              },
            ),
          ],
        );
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: _opportunityPath,
        );

        await scrollTo(tester, find.text(r'Quote Q-0001 sent · $2,700'));
        await scrollTo(
          tester,
          find.text('Email sent: Quote Q-0001 from Riley Rep'),
        );
        expect(find.text('View quote Q-0001'), findsNWidgets(2));
        // A deleted draft has no page to open.
        await scrollTo(tester, find.text('Quote Q-0009 deleted'));
        expect(find.text('View quote Q-0009'), findsNothing);

        await tapVisible(tester, find.text('View quote Q-0001').last);
        expect(app.location, _quotePath);
      },
    );
  });
}
