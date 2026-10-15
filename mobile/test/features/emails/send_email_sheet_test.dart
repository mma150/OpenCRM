import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/quotes/quote_screen.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _quotePath = Routes.quote('opp-1', 'quote-1');
const _send = '/quotes/quote-1/send';

/// A quote's page with the email sheet's two reads: who the opportunity's email usually
/// goes to ([recipients]) and the templates.
FakeApi _api({
  String status = 'DRAFT',
  List<Map<String, Object?>>? recipients,
  List<Map<String, Object?>> templates = const [],
}) {
  return FakeApi()
    ..on(
      'GET',
      '/opportunities/board',
      (request) => boardJson([opportunityJson()]),
    )
    ..on('GET', '/opportunities/opp-1', (request) => opportunityJson())
    ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]))
    ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson())
    ..on('GET', '/quotes', (request) => page([quoteJson(status: status)]))
    ..on('GET', '/quotes/quote-1', (request) => quoteJson(status: status))
    ..on('GET', '/emails/defaults', (request) {
      return {
        'recipients':
            recipients ??
            [
              {
                'name': 'Marcus Chen',
                'email': 'Marcus@Northwind.example',
                'contactId': 'contact-1',
              },
            ],
      };
    })
    ..on('GET', '/email-templates', (request) => templates)
    ..on(
      'POST',
      _send,
      (request) =>
          quoteJson(status: 'SENT', sentAt: '2026-10-14T09:00:00.000Z'),
    );
}

Future<TestApp> _openSheet(
  WidgetTester tester,
  FakeApi api, {
  User user = rep,
}) async {
  final app = await pumpApp(tester, api: api, user: user, location: _quotePath);
  await tapVisible(tester, find.text('Email quote'));
  return app;
}

Future<void> _pressSend(WidgetTester tester) {
  return tapVisible(tester, find.text('Send email'));
}

/// The box under "To" or "Cc" that takes the next address.
Finder _recipientBox(String label) {
  return find.descendant(
    of: find.widgetWithText(LabeledField, label),
    matching: find.byType(TextField),
  );
}

void main() {
  group('the sheet', () {
    testWidgets(
      'starts with the contact in To, the quote wording and the attachment note',
      variant: phones,
      (tester) async {
        final api = _api();
        await _openSheet(tester, api);

        expect(find.text('Email quote Q-0001'), findsOneWidget);
        expect(
          find.textContaining('Q-0001.pdf will be attached.'),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(
            InputChip,
            'Marcus Chen <marcus@northwind.example>',
          ),
          findsOneWidget,
        );
        expect(find.text(quoteEmailSubject), findsOneWidget);
        await scrollTo(tester, find.textContaining('replies go to'));
        expect(
          find.text(
            'Sent as plain text from Riley Rep; replies go to riley@example.com. The '
            'email is added to the timeline of Fleet renewal.',
          ),
          findsOneWidget,
        );
        expect(api.sent('GET', '/emails/defaults').single.query, {
          'recordType': 'OPPORTUNITY',
          'recordId': 'opp-1',
        });
        // No templates: no Template field.
        expect(find.text('Template'), findsNothing);
      },
    );

    testWidgets(
      'sends to the quote route, and the quote, the opportunity and its '
      'timeline load again',
      variant: phones,
      (tester) async {
        final api = _api();
        // From the opportunity's page, whose timeline and Quotes card were read.
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.opportunity('opp-1'),
        );
        await scrollTo(tester, find.text('Nothing logged yet'));
        final timelineReads = api
            .sent('GET', '/opportunities/opp-1/timeline')
            .length;
        final opportunityReads = api.sent('GET', '/opportunities/opp-1').length;
        await tapVisible(tester, find.text('Q-0001'));
        final quotesReads = api.sent('GET', '/quotes').length;
        await tapVisible(tester, find.text('Email quote'));

        await tapVisible(tester, find.text('Add Cc'));
        await tester.enterText(_recipientBox('Cc'), 'Lena@Northwind.example ');
        await tester.pumpAndSettle();
        await _pressSend(tester);

        final sent = api.sent('POST', _send).single;
        expect(sent.query, {'tz': deviceTimeZone()});
        expect(sent.json, {
          'email': {
            'to': ['marcus@northwind.example'],
            'cc': ['lena@northwind.example'],
            'subject': quoteEmailSubject,
            'body': quoteEmailBody,
          },
        });
        expect(
          find.text('Email sent to marcus@northwind.example and 1 more.'),
          findsOneWidget,
        );
        // Back on the quote, which the answer made SENT.
        expect(app.location, _quotePath);
        expect(find.widgetWithText(StatusBadge, 'Sent'), findsOneWidget);

        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(app.location, Routes.opportunity('opp-1'));
        await scrollTo(tester, find.text('Nothing logged yet'));
        expect(
          api.sent('GET', '/opportunities/opp-1/timeline').length,
          greaterThan(timelineReads),
        );
        expect(
          api.sent('GET', '/opportunities/opp-1').length,
          greaterThan(opportunityReads),
        );
        expect(api.sent('GET', '/quotes').length, greaterThan(quotesReads));
      },
    );

    testWidgets('a sent quote is emailed again', (tester) async {
      final api = _api(status: 'SENT');
      await _openSheet(tester, api);

      await _pressSend(tester);

      expect(api.sent('POST', _send), hasLength(1));
      expect(
        find.text('Email sent to marcus@northwind.example.'),
        findsOneWidget,
      );
    });

    testWidgets('no second send while one is on its way', (tester) async {
      final answer = Completer<Object?>();
      final api = _api()..on('POST', _send, (request) => answer.future);
      await _openSheet(tester, api);

      await tester.tap(find.text('Send email'));
      await tester.pump();
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.pump();

      expect(api.sent('POST', _send), hasLength(1));
      answer.complete(quoteJson(status: 'SENT'));
      await tester.pumpAndSettle();
    });
  });

  group('the recipients', () {
    testWidgets(
      'typed addresses become chips, and a chip can be removed',
      variant: phones,
      (tester) async {
        final api = _api(recipients: []);
        await _openSheet(tester, api);

        await tester.enterText(_recipientBox('To'), 'ada@example.com;');
        await tester.pumpAndSettle();
        await tester.enterText(_recipientBox('To'), 'bob@example.com');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(InputChip, 'ada@example.com'),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(InputChip, 'bob@example.com'),
          findsOneWidget,
        );

        await tapVisible(tester, find.byTooltip('Remove ada@example.com'));
        await _pressSend(tester);

        expect(
          api.sent('POST', _send).single.json['email'],
          containsPair('to', ['bob@example.com']),
        );
      },
    );

    testWidgets('an address typed and not yet a chip is sent too', (
      tester,
    ) async {
      final api = _api(recipients: []);
      await _openSheet(tester, api);

      await tester.enterText(_recipientBox('To'), 'ada@example.com');
      await _pressSend(tester);

      expect(
        api.sent('POST', _send).single.json['email'],
        containsPair('to', ['ada@example.com']),
      );
    });

    testWidgets(
      'nothing is sent without an address, or with one that is not valid',
      variant: phones,
      (tester) async {
        final api = _api(recipients: []);
        await _openSheet(tester, api);

        await _pressSend(tester);
        await scrollTo(tester, find.text('Add at least one address.'));

        await tester.enterText(_recipientBox('To'), 'not-an-address');
        await _pressSend(tester);
        await scrollTo(
          tester,
          find.text(
            '"not-an-address" is not a valid email address. Correct it or clear it.',
          ),
        );
        expect(api.sent('POST', _send), isEmpty);
      },
    );

    testWidgets('takes at most ten addresses', (tester) async {
      final api = _api(recipients: []);
      await _openSheet(tester, api);

      await tester.enterText(
        _recipientBox('To'),
        [for (var i = 0; i < 11; i++) 'p$i@example.com'].join(' '),
      );
      await tester.pumpAndSettle();

      expect(find.byType(InputChip), findsNWidgets(10));
      await scrollTo(tester, find.text('Use 10 addresses or fewer.'));
    });

    testWidgets(
      'several usual recipients are offered, not filled in',
      variant: phones,
      (tester) async {
        final api = _api(
          recipients: [
            {
              'name': 'Marcus Chen',
              'email': 'marcus@n.example',
              'contactId': 'c1',
            },
            {
              'name': 'Lena Ortiz',
              'email': 'lena@n.example',
              'contactId': 'c2',
            },
          ],
        );
        await _openSheet(tester, api);

        expect(find.byType(InputChip), findsNothing);
        await tapVisible(tester, find.text('+ Lena Ortiz'));
        expect(
          find.widgetWithText(InputChip, 'Lena Ortiz <lena@n.example>'),
          findsOneWidget,
        );
        expect(find.text('+ Lena Ortiz'), findsNothing);
      },
    );
  });

  group('the text', () {
    testWidgets('a subject and a message are needed', variant: phones, (
      tester,
    ) async {
      final api = _api();
      await _openSheet(tester, api);

      await enterField(tester, 'Subject', '  ');
      await enterField(tester, 'Message', '');
      await _pressSend(tester);

      await scrollTo(tester, find.text('Enter a subject.'));
      await scrollTo(tester, find.text('Write the message.'));
      expect(api.sent('POST', _send), isEmpty);
    });

    testWidgets(
      'a template fills the subject and the message',
      variant: phones,
      (tester) async {
        final api = _api(
          templates: [
            emailTemplateJson(),
            emailTemplateJson(
              id: 'template-2',
              name: 'Team intro',
              shared: true,
              owner: manager,
            ),
          ],
        );
        await _openSheet(tester, api);

        // The quote's own wording was not written by the user: replaced without asking.
        await chooseOption(tester, 'Template', 'Follow-up');
        expect(
          find.text('Following up on {{opportunity.name}}'),
          findsOneWidget,
        );
        expect(
          find.text('Hello {{contact.firstName}}, any questions?'),
          findsOneWidget,
        );

        // Text the user changed is replaced only after asking.
        await enterField(tester, 'Subject', 'My own subject');
        await chooseOption(tester, 'Template', 'Team intro (shared)');
        expect(find.text('Replace what you wrote?'), findsOneWidget);
        await tapVisible(tester, find.text('Cancel'));
        expect(find.text('My own subject'), findsOneWidget);

        await chooseOption(tester, 'Template', 'Team intro (shared)');
        await tapVisible(tester, find.text('Replace'));
        expect(find.text('My own subject'), findsNothing);
        expect(
          find.text('Following up on {{opportunity.name}}'),
          findsOneWidget,
        );
      },
    );
  });

  group('what went wrong, with the draft kept', () {
    Future<FakeApi> failWith(WidgetTester tester, Object error) async {
      final api = _api()..on('POST', _send, (request) => throw error);
      await _openSheet(tester, api);
      await enterField(tester, 'Subject', 'Our quote for the fleet');
      await _pressSend(tester);
      // Still on the sheet, with what was written.
      expect(find.text('Email quote Q-0001'), findsOneWidget);
      expect(find.text('Our quote for the fleet'), findsOneWidget);
      return api;
    }

    testWidgets('email that is not set up', variant: phones, (tester) async {
      await failWith(tester, apiError('EMAIL_NOT_CONFIGURED', status: 409));

      expect(
        find.text(
          'Outgoing email is not set up, so nothing was sent. Your draft is kept. Ask '
          'an Admin to set it up under Settings, Email.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('email that is not set up, said to an Admin', (tester) async {
      final api = _api()
        ..on(
          'POST',
          _send,
          (request) => throw apiError('EMAIL_NOT_CONFIGURED', status: 409),
        );
      await _openSheet(tester, api, user: admin);
      await _pressSend(tester);

      expect(
        find.textContaining(
          'You can set it up in the web app under Settings, Email.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('a mail server that refused it', variant: phones, (
      tester,
    ) async {
      await failWith(
        tester,
        apiError(
          'EMAIL_SEND_FAILED',
          status: 502,
          message: 'The mail server could not be reached (SMTP 421).',
        ),
      );

      expect(
        find.text(
          'The email was not sent. The mail server could not be reached (SMTP 421).',
        ),
        findsOneWidget,
      );
    });

    testWidgets('too many emails, with when to try again', variant: phones, (
      tester,
    ) async {
      await failWith(
        tester,
        apiError(
          'RATE_LIMITED',
          status: 429,
          details: {'retryAfterSeconds': 125},
        ),
      );

      expect(
        find.text(
          'You have sent a lot of emails in a short time, so this one was not sent. '
          'Try again in 3 minutes.',
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      'a quote that changed meanwhile is read again',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'POST',
            _send,
            (request) => throw apiError(
              'INVALID_STATUS_CHANGE',
              status: 409,
              details: {'status': 'ACCEPTED'},
            ),
          );
        final app = await _openSheet(tester, api);
        final reads = api.sent('GET', '/quotes/quote-1').length;
        api.on(
          'GET',
          '/quotes/quote-1',
          (request) => quoteJson(status: 'ACCEPTED'),
        );

        await _pressSend(tester);

        expect(
          find.text(
            'That is no longer possible: the status has changed in the meantime. The '
            'page now shows the current status.',
          ),
          findsOneWidget,
        );
        expect(api.sent('GET', '/quotes/quote-1').length, reads + 1);
        // Closing the sheet shows the quote as it now is: nothing to email.
        await tester.tap(find.byTooltip('Close'));
        await tester.pumpAndSettle();
        expect(app.location, _quotePath);
        expect(find.widgetWithText(StatusBadge, 'Accepted'), findsOneWidget);
        expect(find.text('Email quote'), findsNothing);
      },
    );

    testWidgets(
      'an address the server refused is said under To',
      variant: phones,
      (tester) async {
        await failWith(
          tester,
          validationError({'email.to.0': 'Enter a valid email address'}),
        );

        await scrollTo(tester, find.text('Enter a valid email address'));
      },
    );
  });

  testWidgets('a Read-only user is never offered the sheet', (tester) async {
    final api = _api(status: 'SENT');
    await pumpApp(tester, api: api, user: readOnly, location: _quotePath);

    expect(find.text('Email quote'), findsNothing);
    expect(api.sent('GET', '/emails/defaults'), isEmpty);
    expect(api.sent('GET', '/email-templates'), isEmpty);
  });
}
