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
          headers: {
            'Accept': 'application/json',
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
    final body = response.data;

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
