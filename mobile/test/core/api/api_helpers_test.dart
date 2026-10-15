import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/api/server_address.dart';

void main() {
  group('ListQuery', () {
    test('sends the page and page size, and leaves out what is not set', () {
      expect(const ListQuery().toQuery(), {'page': '1', 'pageSize': '25'});
    });

    test(
      'sends search (trimmed), sort, order and the filters that have a value',
      () {
        const query = ListQuery(
          search: '  north wind ',
          sort: 'name',
          order: 'asc',
          page: 3,
          pageSize: 50,
          filters: {'status': 'NEW', 'source': null, 'ownerId': ''},
        );

        expect(query.toQuery(), {
          'page': '3',
          'pageSize': '50',
          'search': 'north wind',
          'sort': 'name',
          'order': 'asc',
          'status': 'NEW',
        });
      },
    );
  });

  group('Page', () {
    test('reads the rows and the paging meta', () {
      final page = Page.fromResponse(
        const ApiResponse(
          [
            {'id': 'a'},
            {'id': 'b'},
          ],
          {'page': 1, 'pageSize': 2, 'total': 5},
        ),
        (json) => readString(json, 'id'),
      );

      expect(page.items, ['a', 'b']);
      expect(page.meta.total, 5);
      expect(page.meta.hasMore, true);
    });

    test('has no more rows on the last page, or past it', () {
      expect(const ListMeta(page: 3, pageSize: 2, total: 5).hasMore, false);
      expect(const ListMeta(page: 9, pageSize: 2, total: 5).hasMore, false);
    });

    test('fails with a FormatException when the answer is not a list', () {
      expect(
        () => Page.fromResponse(
          const ApiResponse(
            {'id': 'a'},
            {'page': 1, 'pageSize': 2, 'total': 5},
          ),
          (json) => json,
        ),
        throwsFormatException,
      );
    });
  });

  group('json readers', () {
    test('read each type and name the key when it is wrong', () {
      final json = asMap({
        'name': 'Ada',
        'count': 3,
        'value': 12.5,
        'at': '2026-11-15T09:30:00.000Z',
        'none': null,
      });

      expect(readString(json, 'name'), 'Ada');
      expect(readStringOrNull(json, 'none'), isNull);
      expect(readInt(json, 'count'), 3);
      expect(readDouble(json, 'count'), 3.0);
      expect(readDoubleOrNull(json, 'none'), isNull);
      expect(readDate(json, 'at').toUtc(), DateTime.utc(2026, 11, 15, 9, 30));
      expect(readDate(json, 'at').isUtc, false);
      expect(readDateOrNull(json, 'none'), isNull);
      expect(
        () => readString(json, 'count'),
        throwsA(
          isA<FormatException>().having(
            (error) => error.message,
            'message',
            contains('"count"'),
          ),
        ),
      );
      expect(() => readDate(json, 'name'), throwsFormatException);
    });
  });

  group('ApiError.from', () {
    test('keeps an ApiError and turns anything else into UNEXPECTED', () {
      const error = ApiError(code: 'NOT_FOUND', message: 'Lead not found');

      expect(ApiError.from(error), same(error));
      expect(
        ApiError.from(const FormatException('bad')).code,
        ApiError.unexpected,
      );
    });
  });

  group('describeApiError', () {
    String describe(String code, {Object? details}) {
      return describeApiError(
        ApiError(code: code, message: 'Server text', details: details),
      );
    }

    test('chooses the words by the code', () {
      expect(
        describe('INVALID_CREDENTIALS'),
        'Email or password is incorrect.',
      );
      expect(
        describe('ACCOUNT_DEACTIVATED'),
        'This account has been deactivated. Ask an Admin to reactivate it.',
      );
      expect(describe('FORBIDDEN'), 'You do not have permission to do that.');
      expect(
        describe(ApiError.network),
        'The server cannot be reached. Check your connection and try again.',
      );
      expect(
        describe('LEAD_CONVERTED'),
        'This lead has been converted and can no longer be changed.',
      );
    });

    test('says when to try again for a lock and a rate limit', () {
      expect(
        describe('ACCOUNT_LOCKED', details: {'retryAfterSeconds': 840}),
        'This account is locked after too many wrong passwords. Try again in 14 minutes.',
      );
      expect(
        describe('RATE_LIMITED', details: {'retryAfterSeconds': 31}),
        'Too many attempts. Try again in 1 minute.',
      );
      expect(
        describe('RATE_LIMITED'),
        'Too many attempts. Try again in a few minutes.',
      );
    });

    test('the email and status codes of a quote, in the web wording', () {
      expect(
        describe('EMAIL_NOT_CONFIGURED'),
        'Outgoing email is not set up, so nothing was sent. An Admin can set it up '
        'under Settings, Email.',
      );
      // The API's sentence names the kind of problem and never the mail server's text.
      expect(
        describe('EMAIL_SEND_FAILED'),
        'The email was not sent. Server text',
      );
      expect(
        describe('INVALID_STATUS_CHANGE'),
        'That is no longer possible: the status has changed in the meantime. The '
        'page now shows the current status.',
      );
    });

    test('shows the code and the server text for a code it does not know', () {
      expect(describe('BRAND_NEW_CODE'), 'BRAND_NEW_CODE: Server text');
    });
  });

  group('ServerAddress.parse', () {
    String? url(String input, {bool allowHttp = true}) {
      return ServerAddress.parse(input, allowHttp: allowHttp).url;
    }

    test('adds https, and drops a trailing slash and /api/v1', () {
      expect(url('crm.example.com'), 'https://crm.example.com');
      expect(url(' https://CRM.Example.com/ '), 'https://crm.example.com');
      expect(url('https://crm.example.com/api/v1/'), 'https://crm.example.com');
      expect(url('https://example.com/crm'), 'https://example.com/crm');
      expect(url('http://10.0.2.2:4100'), 'http://10.0.2.2:4100');
    });

    test('refuses http when it is not allowed (a release build)', () {
      final parsed = ServerAddress.parse(
        'http://crm.example.com',
        allowHttp: false,
      );

      expect(parsed.url, isNull);
      expect(parsed.error, contains('https://'));
      expect(url('https://crm.example.com', allowHttp: false), isNotNull);
    });

    test('refuses an empty address and things that are not an address', () {
      for (final input in [
        '',
        '   ',
        'ftp://crm.example.com',
        'https://',
        'https://crm.example.com/?next=1',
        'https://user:pass@crm.example.com',
      ]) {
        final parsed = ServerAddress.parse(input);
        expect(parsed.url, isNull, reason: input);
        expect(parsed.error, isNotNull, reason: input);
      }
    });
  });
}
