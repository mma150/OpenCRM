import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/features/emails/email.dart';
import 'package:opencrm/features/quotes/quote.dart';

import '../../support/fixtures.dart';

void main() {
  group('Quote.fromJson', () {
    test('reads every field', () {
      final quote = Quote.fromJson(
        quoteJson(
          status: 'SENT',
          lines: [
            quoteLineJson(
              quantity: 1.5,
              unitPrice: 99.99,
              discountPercent: 10,
              taxRate: 12.5,
              lineTotal: 134.99,
            ),
          ],
          discountType: 'PERCENT',
          discountValue: 5,
          notes: 'Delivery in two weeks.',
          terms: 'Net 30.',
          sentAt: '2026-10-06T10:00:00.000Z',
          invoice: {'id': 'invoice-1', 'number': 'INV-0001'},
        ),
      );

      expect(quote.id, 'quote-1');
      expect(quote.number, 'Q-0001');
      expect(quote.opportunity.id, 'opp-1');
      expect(quote.opportunity.name, 'Fleet renewal');
      expect(quote.contact?.name, 'Marcus Chen');
      expect(quote.contact?.email, 'marcus@northwind.example');
      expect(quote.company?.name, 'Northwind Logistics');
      expect(quote.status, QuoteStatus.sent);
      expect(quote.issueDate, '2026-10-05');
      expect(quote.validUntil, '2026-11-04');
      final line = quote.lines.single;
      expect(line.quantity, 1.5);
      expect(line.unitPrice, 99.99);
      expect(line.discountPercent, 10);
      expect(line.taxRate, 12.5);
      expect(line.lineTotal, 134.99);
      expect(quote.discountType, QuoteDiscountType.percent);
      expect(quote.discountValue, 5);
      expect(quote.subtotal, 2500);
      expect(quote.taxTotal, 200);
      expect(quote.total, 2700);
      expect(quote.notes, 'Delivery in two weeks.');
      expect(quote.terms, 'Net 30.');
      expect(quote.sentAt?.toUtc(), DateTime.utc(2026, 10, 6, 10));
      expect(quote.acceptedAt, isNull);
      expect(quote.invoiceNumber, 'INV-0001');
      expect(quote.createdBy.name, rep.name);
      expect(quote.pdfFileName, 'Q-0001.pdf');
    });

    test('reads the nulls', () {
      final quote = Quote.fromJson(
        quoteJson(contact: null, company: null, validUntil: null, lines: []),
      );

      expect(quote.contact, isNull);
      expect(quote.company, isNull);
      expect(quote.validUntil, isNull);
      expect(quote.lines, isEmpty);
      expect(quote.invoiceNumber, isNull);
      expect(quote.notes, isNull);
    });

    test('a contact without an address', () {
      final quote = Quote.fromJson(
        quoteJson(contact: {'id': 'c-1', 'name': 'Ada', 'email': null}),
      );

      expect(quote.contact?.email, isNull);
    });

    test(
      'an unknown status throws: guessing it would offer the wrong actions',
      () {
        expect(
          () => Quote.fromJson(quoteJson(status: 'ARCHIVED')),
          throwsFormatException,
        );
      },
    );

    test('an unknown discount kind reads as a plain amount', () {
      final quote = Quote.fromJson(quoteJson(discountType: 'COUPON'));

      expect(quote.discountType, QuoteDiscountType.amount);
    });

    test('a missing opportunity is a format error, not a crash', () {
      final json = quoteJson()..remove('opportunity');

      expect(() => Quote.fromJson(json), throwsFormatException);
    });
  });

  group('canBeEmailed follows the API', () {
    bool canEmail(String status, {bool lines = true}) {
      return Quote.fromJson(quoteJson(status: status, lines: lines ? null : []))
          .canBeEmailed;
    }

    test('a draft with lines, a sent and an expired quote', () {
      expect(canEmail('DRAFT'), isTrue);
      expect(canEmail('SENT'), isTrue);
      expect(canEmail('EXPIRED'), isTrue);
    });

    test('not a draft without lines, an accepted or a declined quote', () {
      expect(canEmail('DRAFT', lines: false), isFalse);
      expect(canEmail('ACCEPTED'), isFalse);
      expect(canEmail('DECLINED'), isFalse);
    });
  });

  test('the PDF name keeps only what a file name may hold', () {
    expect(quotePdfFileName('Q-0042'), 'Q-0042.pdf');
    expect(quotePdfFileName('../Q 7/x'), '..Q7x.pdf');
    expect(quotePdfFileName('/'), 'quote.pdf');
  });

  group('recipients', () {
    test('adds valid addresses in lower case and drops repeats', () {
      final result = addRecipients(const [
        'ada@example.com',
      ], 'Bob@Example.com, ada@example.com;  cy@example.org');

      expect(result.value, [
        'ada@example.com',
        'bob@example.com',
        'cy@example.org',
      ]);
      expect(result.rest, '');
      expect(result.problem, isNull);
    });

    test('keeps what is not an address, with the reason', () {
      final result = addRecipients(const [], 'ada@example.com nope');

      expect(result.value, ['ada@example.com']);
      expect(result.rest, 'nope');
      expect(
        result.problem,
        '"nope" is not a valid email address. Correct it or clear it.',
      );
    });

    test('takes at most ten', () {
      final ten = [for (var i = 0; i < 10; i++) 'p$i@example.com'];
      final result = addRecipients(ten, 'eleven@example.com');

      expect(result.value, ten);
      expect(result.rest, 'eleven@example.com');
      expect(result.problem, 'Use 10 addresses or fewer.');
    });

    test('an email message sends cc only when there is one', () {
      expect(
        const EmailMessage(
          to: ['a@example.com'],
          subject: 'Hi',
          body: 'Text',
        ).toJson(),
        {
          'to': ['a@example.com'],
          'subject': 'Hi',
          'body': 'Text',
        },
      );
      expect(
        const EmailMessage(
          to: ['a@example.com'],
          cc: ['b@example.com'],
          subject: 'Hi',
          body: 'Text',
        ).toJson()['cc'],
        ['b@example.com'],
      );
    });
  });
}
