import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/json.dart';

/// [ApiClient] over HTTP with dio. The only file that imports dio.
class DioApiClient extends ApiClient {
  DioApiClient({Dio? dio}) : _dio = dio ?? Dio() {
    _dio.options
      ..connectTimeout = const Duration(seconds: 10)
      ..sendTimeout = const Duration(seconds: 20)
      ..receiveTimeout = const Duration(seconds: 20)
      ..responseType = ResponseType.json
      // Every status comes back as a response, so the error envelope is read in one place.
      ..validateStatus = (_) => true;
  }

  final Dio _dio;

  @override
  Future<ApiResponse> perform(ApiRequest request) async {
    final Response<Object?> response;
    try {
      response = await _dio.request<Object?>(
        request.url,
        data: request.body,
        queryParameters: request.query.isEmpty ? null : request.query,
        options: Options(
          method: request.method,
          // A file comes as bytes; its failure is still the JSON envelope, read below.
          responseType: request.file ? ResponseType.bytes : null,
          headers: {
            'Accept': request.file ? '*/*' : 'application/json',
            if (request.body != null) 'Content-Type': 'application/json',
            if (request.token != null)
              'Authorization': 'Bearer ${request.token}',
          },
        ),
      );
    } on DioException catch (error) {
      throw _connectionError(error);
    }

    final status = response.statusCode ?? 0;
    final requestId = response.headers.value('x-request-id');
    final Object? body;
    if (request.file) {
      final data = response.data;
      final bytes = data is Uint8List
          ? data
          : Uint8List.fromList(data is List<int> ? data : const []);
      final type = response.headers.value(Headers.contentTypeHeader);
      if (status >= 200 && status < 300 && !_isJson(type)) {
        return ApiResponse(
          ApiFile(
            bytes: bytes,
            contentType: type,
            fileName: fileNameOf(response.headers.value('content-disposition')),
          ),
        );
      }
      body = _decodeJson(bytes);
    } else {
      body = response.data;
    }

    final error = ApiError.fromEnvelope(
      body,
      statusCode: status,
      requestId: requestId,
    );
    if (error != null) {
      throw error;
    }
    if (status >= 200 &&
        status < 300 &&
        body is Map &&
        body.containsKey('data')) {
      return ApiResponse(
        body['data'],
        body['meta'] is Map ? asMap(body['meta']) : const {},
      );
    }
    throw ApiError(
      code: ApiError.invalidResponse,
      message: 'This does not look like an OpenCRM server.',
      statusCode: status,
      requestId: requestId,
    );
  }

  static bool _isJson(String? contentType) =>
      contentType != null && contentType.toLowerCase().contains('json');

  /// The body of a file request that failed: the JSON error envelope, or null.
  static Object? _decodeJson(Uint8List bytes) {
    try {
      return jsonDecode(utf8.decode(bytes));
    } on FormatException {
      return null;
    }
  }

  ApiError _connectionError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiError(
          code: ApiError.timeout,
          message: 'The server took too long to answer.',
        );
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown when error.error is FormatException:
        // A body that is not JSON (an HTML error page of a proxy, for example).
        return ApiError(
          code: ApiError.invalidResponse,
          message: 'This does not look like an OpenCRM server.',
          statusCode: error.response?.statusCode,
        );
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
      case DioExceptionType.unknown:
        return const ApiError(
          code: ApiError.network,
          message: 'The server cannot be reached.',
        );
    }
  }
}

/// The file name of a `Content-Disposition` header (`attachment; filename="Q-0001.pdf"`),
/// or null when it names none.
String? fileNameOf(String? contentDisposition) {
  if (contentDisposition == null) {
    return null;
  }
  final match = RegExp(
    r'''filename\*?=(?:UTF-8'')?"?([^";]+)"?''',
    caseSensitive: false,
  ).firstMatch(contentDisposition);
  final name = match?.group(1)?.trim();
  return name == null || name.isEmpty ? null : name;
}
