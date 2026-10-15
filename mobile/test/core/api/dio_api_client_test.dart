import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/dio_api_client.dart';

/// Stands in for the network under dio: answers with a status and a body, or fails the
/// way a connection does. Everything above it is the real client.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.answer);

  final ResponseBody Function(RequestOptions options) answer;
  final List<RequestOptions> requests = [];
  String? lastBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (requestStream != null) {
      final bytes = await requestStream.expand((chunk) => chunk).toList();
      lastBody = utf8.decode(bytes);
    }
    return answer(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object? body, {int status = 200, String? requestId}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      'x-request-id': ?(requestId == null ? null : [requestId]),
    },
  );
}

({DioApiClient client, _Adapter adapter}) _client(
  ResponseBody Function(RequestOptions options) answer,
) {
  final adapter = _Adapter(answer);
  final client = DioApiClient(dio: Dio()..httpClientAdapter = adapter)
    ..serverUrl = 'https://crm.example.test'
    ..token = 'secret-token';
  return (client: client, adapter: adapter);
}

Future<ApiError> _errorOf(Future<Object?> request) async {
  try {
    await request;
  } on ApiError catch (error) {
    return error;
  }
  fail('the request did not throw an ApiError');
}

void main() {
  group('a successful answer', () {
    test('is unwrapped from the envelope, with its meta', () async {
      final (:client, :adapter) = _client(
        (_) => _json({
          'data': [
            {'id': 'lead-1'},
          ],
          'meta': {'page': 1, 'pageSize': 25, 'total': 1},
        }),
      );

      final response = await client.get('/leads', query: {'page': '1'});

      expect(response.data, [
        {'id': 'lead-1'},
      ]);
      expect(response.meta, {'page': 1, 'pageSize': 25, 'total': 1});
      expect(
        adapter.requests.single.uri.toString(),
        'https://crm.example.test/api/v1/leads?page=1',
      );
    });

    test('keeps data: null as null', () async {
      final (:client, adapter: _) = _client(
        (_) => _json({'data': null, 'meta': <String, Object?>{}}),
      );

      expect((await client.delete('/leads/lead-1')).data, isNull);
    });
  });

  group('the request', () {
    test('carries the token as a Bearer header and the body as JSON', () async {
      final (:client, :adapter) = _client(
        (_) =>
            _json({'data': <String, Object?>{}, 'meta': <String, Object?>{}}),
      );

      await client.post('/leads', body: {'firstName': 'Marcus'});

      final sent = adapter.requests.single;
      expect(sent.method, 'POST');
      expect(sent.headers['Authorization'], 'Bearer secret-token');
      expect(sent.headers['Content-Type'], 'application/json');
      expect(jsonDecode(adapter.lastBody!), {'firstName': 'Marcus'});
    });

    test('sends no Authorization header without a token', () async {
      final (:client, :adapter) = _client(
        (_) =>
            _json({'data': <String, Object?>{}, 'meta': <String, Object?>{}}),
      );
      client.token = null;

      await client.get('/health');

      expect(
        adapter.requests.single.headers.containsKey('Authorization'),
        false,
      );
    });

    test('to another server address leaves the saved token out', () async {
      final (:client, :adapter) = _client(
        (_) =>
            _json({'data': <String, Object?>{}, 'meta': <String, Object?>{}}),
      );

      await client.send(
        'GET',
        '/health',
        serverUrl: 'https://other.example.test',
      );

      final sent = adapter.requests.single;
      expect(sent.uri.toString(), 'https://other.example.test/api/v1/health');
      expect(sent.headers.containsKey('Authorization'), false);
    });

    test('fails as NETWORK_ERROR when no server address is set', () async {
      final (:client, :adapter) = _client((_) => _json({'data': null}));
      client.serverUrl = null;

      expect((await _errorOf(client.get('/leads'))).code, ApiError.network);
      expect(adapter.requests, isEmpty);
    });
  });

  group('a failed answer', () {
    test(
      'becomes an ApiError with the code, message, details and request id',
      () async {
        final (:client, adapter: _) = _client(
          (_) => _json(
            {
              'error': {
                'code': 'VALIDATION_FAILED',
                'message': 'Request validation failed',
                'details': [
                  {'path': 'email', 'message': 'Enter a valid email'},
                  {'path': 'email', 'message': 'A second message'},
                  {'path': 'customFields.abc', 'message': 'Required'},
                ],
              },
            },
            status: 400,
            requestId: 'req-12345678',
          ),
        );

        final error = await _errorOf(
          client.post('/leads', body: {'email': 'x'}),
        );

        expect(error.code, 'VALIDATION_FAILED');
        expect(error.message, 'Request validation failed');
        expect(error.statusCode, 400);
        expect(error.requestId, 'req-12345678');
        expect(error.fieldErrors, {
          'email': 'Enter a valid email',
          'customFields.abc': 'Required',
        });
      },
    );

    test('reads retryAfterSeconds of a lock or a rate limit', () async {
      final (:client, adapter: _) = _client(
        (_) => _json({
          'error': {
            'code': 'ACCOUNT_LOCKED',
            'message': 'Locked',
            'details': {'retryAfterSeconds': 840},
          },
        }, status: 423),
      );

      final error = await _errorOf(client.post('/auth/token', body: {}));

      expect(error.code, 'ACCOUNT_LOCKED');
      expect(error.retryAfterSeconds, 840);
      expect(error.fieldErrors, isEmpty);
    });

    test('that is not the API envelope is INVALID_RESPONSE', () async {
      final (:client, adapter: _) = _client((_) => _json({'hello': 'world'}));
      final html = _client(
        (_) => ResponseBody.fromString(
          '<html>Bad gateway</html>',
          502,
          headers: {
            Headers.contentTypeHeader: ['text/html'],
          },
        ),
      );

      expect(
        (await _errorOf(client.get('/health'))).code,
        ApiError.invalidResponse,
      );
      expect(
        (await _errorOf(html.client.get('/health'))).code,
        ApiError.invalidResponse,
      );
    });

    test(
      'of the connection is NETWORK_ERROR, and a slow one TIMEOUT',
      () async {
        final refused = _client(
          (options) => throw DioException.connectionError(
            requestOptions: options,
            reason: 'Connection refused',
          ),
        );
        final slow = _client(
          (options) => throw DioException.receiveTimeout(
            timeout: const Duration(seconds: 20),
            requestOptions: options,
          ),
        );

        expect(
          (await _errorOf(refused.client.get('/leads'))).code,
          ApiError.network,
        );
        expect(
          (await _errorOf(slow.client.get('/leads'))).code,
          ApiError.timeout,
        );
      },
    );
  });

  group('a session that has ended', () {
    ResponseBody unauthenticated(RequestOptions _) {
      return _json({
        'error': {
          'code': 'UNAUTHENTICATED',
          'message': 'Sign in to continue',
          'details': null,
        },
      }, status: 401);
    }

    test('calls onUnauthenticated once and still throws', () async {
      final (:client, adapter: _) = _client(unauthenticated);
      var calls = 0;
      client.onUnauthenticated = () => calls += 1;

      final error = await _errorOf(client.get('/leads'));

      expect(error.code, ApiError.unauthenticated);
      expect(calls, 1);
    });

    test(
      'is told by the code, not by HTTP 401: a wrong password signs nobody out',
      () async {
        final (:client, adapter: _) = _client(
          (_) => _json({
            'error': {
              'code': 'INVALID_CREDENTIALS',
              'message': 'Email or password is incorrect',
              'details': null,
            },
          }, status: 401),
        );
        var calls = 0;
        client.onUnauthenticated = () => calls += 1;

        final error = await _errorOf(client.post('/auth/token', body: {}));

        expect(error.code, 'INVALID_CREDENTIALS');
        expect(calls, 0);
      },
    );

    test(
      'does not sign out for a request made with its own token (the logout)',
      () async {
        final (:client, adapter: _) = _client(unauthenticated);
        var calls = 0;
        client.onUnauthenticated = () => calls += 1;

        await _errorOf(client.send('POST', '/auth/logout', token: 'old-token'));

        expect(calls, 0);
      },
    );
  });

  group('a file', () {
    ResponseBody pdf(List<int> bytes, {String? disposition}) {
      return ResponseBody.fromBytes(
        bytes,
        200,
        headers: {
          Headers.contentTypeHeader: ['application/pdf'],
          'content-disposition': ?(disposition == null ? null : [disposition]),
        },
      );
    }

    test('comes back as its bytes, its type and its name', () async {
      final (:client, :adapter) = _client(
        (_) => pdf([
          37,
          80,
          68,
          70,
        ], disposition: 'attachment; filename="Q-0001.pdf"'),
      );

      final file = await client.getFile('/quotes/quote-1/pdf');

      expect(file.bytes, [37, 80, 68, 70]);
      expect(file.contentType, 'application/pdf');
      expect(file.fileName, 'Q-0001.pdf');
      final sent = adapter.requests.single;
      expect(sent.uri.path, '/api/v1/quotes/quote-1/pdf');
      expect(sent.headers['Authorization'], 'Bearer secret-token');
    });

    test('without a Content-Disposition has no name', () async {
      final (:client, adapter: _) = _client((_) => pdf([1, 2, 3]));

      expect((await client.getFile('/quotes/quote-1/pdf')).fileName, isNull);
    });

    test('that failed is the API error of its JSON body', () async {
      final (:client, adapter: _) = _client(
        (_) => _json(
          {
            'error': {
              'code': 'NOT_FOUND',
              'message': 'Quote not found',
              'details': null,
            },
          },
          status: 404,
          requestId: 'req-9',
        ),
      );

      final error = await _errorOf(client.getFile('/quotes/quote-1/pdf'));

      expect(error.code, 'NOT_FOUND');
      expect(error.statusCode, 404);
      expect(error.requestId, 'req-9');
    });

    test('answered as JSON data is not a file', () async {
      final (:client, adapter: _) = _client(
        (_) =>
            _json({'data': <String, Object?>{}, 'meta': <String, Object?>{}}),
      );

      final error = await _errorOf(client.getFile('/quotes/quote-1/pdf'));

      expect(error.code, ApiError.invalidResponse);
    });

    test('that failed without JSON is not an OpenCRM answer', () async {
      final (:client, adapter: _) = _client(
        (_) => ResponseBody.fromString(
          '<html>Bad gateway</html>',
          502,
          headers: {
            Headers.contentTypeHeader: ['text/html'],
          },
        ),
      );

      final error = await _errorOf(client.getFile('/quotes/quote-1/pdf'));

      expect(error.code, ApiError.invalidResponse);
    });

    test('reads the names a Content-Disposition can carry', () {
      expect(fileNameOf('attachment; filename="Q-0001.pdf"'), 'Q-0001.pdf');
      expect(fileNameOf('attachment; filename=Q-0002.pdf'), 'Q-0002.pdf');
      expect(
        fileNameOf("attachment; filename*=UTF-8''Q-0003.pdf"),
        'Q-0003.pdf',
      );
      expect(fileNameOf('attachment'), isNull);
      expect(fileNameOf(null), isNull);
    });
  });
}
