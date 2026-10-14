import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';

/// What a test's handler is given: the request as the app made it.
class FakeRequest {
  const FakeRequest(this.method, this.path, this.query, this.body, this.token);

  final String method;

  /// After `/api/v1`, such as `/leads/lead-1`.
  final String path;
  final Map<String, String> query;
  final Object? body;
  final String? token;

  /// The body as a JSON object.
  Map<String, Object?> get json => (body! as Map).cast<String, Object?>();

  @override
  String toString() => '$method $path';
}

typedef FakeHandler = Object? Function(FakeRequest request);

/// The API of the tests: no network. A test says what each route answers and reads back
/// what the app sent.
///
/// ```dart
/// final api = FakeApi()
///   ..on('GET', '/leads', (request) => page([leadJson()]))
///   ..on('POST', '/leads', (request) => throw validationError({'email': 'Not an email'}));
/// ```
///
/// A handler returns the `data` of the answer (or an [ApiResponse] to set `meta`, as
/// [page] does), or throws an [ApiError]. It may return a `Future` to keep the app waiting.
/// A request no handler matches fails the request and is listed in [unhandled], which
/// `pumpApp` checks at the end of every test.
class FakeApi extends ApiClient {
  final _handlers = <(String, Pattern, FakeHandler)>[];

  /// Every request the app made, in order.
  final List<FakeRequest> requests = [];
  final List<FakeRequest> unhandled = [];

  /// [path] is the whole path (`'/leads'`) or a [RegExp] that must match all of it.
  /// The handler added last wins, so a test can replace an answer part-way through.
  void on(String method, Pattern path, FakeHandler handler) {
    _handlers.insert(0, (method, path, handler));
  }

  /// An answer for when the test gave none for this route: any [on] handler wins over it.
  void onDefault(String method, Pattern path, FakeHandler handler) {
    _handlers.add((method, path, handler));
  }

  /// The requests the app made to one route.
  List<FakeRequest> sent(String method, Pattern path) {
    return [
      for (final request in requests)
        if (request.method == method && _matches(path, request.path)) request,
    ];
  }

  static bool _matches(Pattern pattern, String path) {
    if (pattern is String) {
      return pattern == path;
    }
    final match = pattern.matchAsPrefix(path);
    return match != null && match.end == path.length;
  }

  @override
  Future<ApiResponse> perform(ApiRequest request) async {
    final fake = FakeRequest(
      request.method,
      request.path,
      request.query,
      request.body,
      request.token,
    );
    requests.add(fake);
    for (final (method, path, handler) in _handlers) {
      if (method == request.method && _matches(path, request.path)) {
        final answer = await Future<Object?>.value(handler(fake));
        return answer is ApiResponse ? answer : ApiResponse(answer);
      }
    }
    unhandled.add(fake);
    throw ApiError(
      code: 'NOT_FOUND',
      message: 'FakeApi has no handler for $fake',
      statusCode: 404,
    );
  }
}

/// A list answer: the rows and the paging `meta`.
ApiResponse page(
  List<Object?> items, {
  int? total,
  int page = 1,
  int pageSize = 25,
}) {
  return ApiResponse(items, {
    'page': page,
    'pageSize': pageSize,
    'total': total ?? items.length,
  });
}

/// The error envelope as the app receives it.
ApiError apiError(
  String code, {
  String message = 'Server message',
  Object? details,
  int? status,
}) {
  return ApiError(
    code: code,
    message: message,
    details: details,
    statusCode: status,
  );
}

/// `VALIDATION_FAILED` with one message per field path.
ApiError validationError(Map<String, String> fields) {
  return apiError(
    'VALIDATION_FAILED',
    status: 400,
    details: [
      for (final entry in fields.entries)
        {'path': entry.key, 'message': entry.value},
    ],
  );
}
