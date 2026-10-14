import 'package:opencrm/core/api/json.dart';

/// What every failed request becomes: the API's error envelope
/// (`{ error: { code, message, details } }`), or one of the codes below when the server
/// never answered. Screens switch on [code], never on [message] or the HTTP status: a wrong
/// password and an ended session are both 401.
class ApiError implements Exception {
  const ApiError({
    required this.code,
    required this.message,
    this.details,
    this.statusCode,
    this.requestId,
  });

  /// The server could not be reached at all.
  static const network = 'NETWORK_ERROR';

  /// The server did not answer in time.
  static const timeout = 'TIMEOUT';

  /// An answer that is not the API's envelope: probably not an OpenCRM server.
  static const invalidResponse = 'INVALID_RESPONSE';

  /// A bug on this side (a model that could not read an answer, for example).
  static const unexpected = 'UNEXPECTED';

  static const unauthenticated = 'UNAUTHENTICATED';
  static const validationFailed = 'VALIDATION_FAILED';

  final String code;
  final String message;

  /// `null`, a list of `{ path, message }` for a validation failure, or an object such as
  /// `{ retryAfterSeconds }`.
  final Object? details;
  final int? statusCode;

  /// The `X-Request-Id` of the response: what a user quotes to whoever runs the server.
  final String? requestId;

  /// Any thrown thing as an [ApiError], so a screen has one type to show.
  factory ApiError.from(Object error) {
    return error is ApiError
        ? error
        : const ApiError(code: unexpected, message: 'Something went wrong.');
  }

  /// The messages of a validation failure by field path (`firstName`, `customFields.<id>`).
  /// Empty for every other error.
  Map<String, String> get fieldErrors {
    final list = details;
    if (list is! List) {
      return const {};
    }
    final errors = <String, String>{};
    for (final item in list) {
      if (item is Map && item['path'] is String && item['message'] is String) {
        // The first message of a field wins, as on the web.
        errors.putIfAbsent(
          item['path'] as String,
          () => item['message'] as String,
        );
      }
    }
    return errors;
  }

  /// `details.retryAfterSeconds` of `ACCOUNT_LOCKED` and `RATE_LIMITED`.
  int? get retryAfterSeconds {
    final map = details;
    if (map is! Map) {
      return null;
    }
    final seconds = map['retryAfterSeconds'];
    return seconds is num ? seconds.round() : null;
  }

  /// Reads the error envelope of a response body, or null when the body is not one.
  static ApiError? fromEnvelope(
    Object? body, {
    int? statusCode,
    String? requestId,
  }) {
    if (body is! Map || body['error'] is! Map) {
      return null;
    }
    final error = asMap(body['error']);
    final code = error['code'];
    final message = error['message'];
    if (code is! String || message is! String) {
      return null;
    }
    return ApiError(
      code: code,
      message: message,
      details: error['details'],
      statusCode: statusCode,
      requestId: requestId,
    );
  }

  @override
  String toString() => 'ApiError($code, $message)';
}
