import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/dio_api_client.dart';
import 'package:opencrm/core/api/json.dart';

/// The path every route of the API lives under, after the server address.
const apiPrefix = '/api/v1';

/// A successful answer with its envelope taken off: `{ data, meta }`.
class ApiResponse {
  const ApiResponse(this.data, [this.meta = const {}]);

  final Object? data;
  final Json meta;
}

/// A file the API answered instead of JSON (a quote's PDF): its bytes, its media type and
/// the name the server gave it in `Content-Disposition`, if any. A failure is still the
/// JSON error envelope, read into an [ApiError] like any other.
class ApiFile {
  const ApiFile({required this.bytes, this.contentType, this.fileName});

  final Uint8List bytes;

  /// Such as `application/pdf`.
  final String? contentType;

  /// Such as `Q-0001.pdf`.
  final String? fileName;
}

/// One request, as the feature API files describe it. [path] starts after `/api/v1`.
class ApiRequest {
  const ApiRequest({
    required this.method,
    required this.path,
    required this.serverUrl,
    this.query = const {},
    this.body,
    this.token,
    this.file = false,
  });

  final String method;
  final String path;
  final String serverUrl;
  final Map<String, String> query;
  final Object? body;
  final String? token;

  /// The answer is a file ([ApiFile]), not the JSON envelope.
  final bool file;

  String get url => '$serverUrl$apiPrefix$path';
}

/// The one way the app talks to the API. Feature API files (`leads_api.dart`) call [get],
/// [post], [patch], [put] and [delete] and read the unwrapped `data`; every failure is an
/// [ApiError].
///
/// Two implementations exist: [DioApiClient] (the real one) and the `FakeApi` of the tests.
/// They differ only in [perform]; everything else, including what happens when the session
/// has ended, is shared here.
abstract class ApiClient {
  /// The server the user chose (`https://crm.example.com`), set by the auth controller.
  String? serverUrl;

  /// The session token, sent as `Authorization: Bearer`. Set by the auth controller.
  String? token;

  /// Called when an answer says the session has ended (`UNAUTHENTICATED`), so the user is
  /// signed out in one place. Set by the auth controller.
  void Function()? onUnauthenticated;

  /// Sends the request and returns the unwrapped answer, or throws an [ApiError].
  Future<ApiResponse> perform(ApiRequest request);

  /// [serverUrl] and [token] override the saved ones: checking an address before it is
  /// saved, and signing out with a token that has already been forgotten.
  Future<ApiResponse> send(
    String method,
    String path, {
    Map<String, String> query = const {},
    Object? body,
    String? serverUrl,
    String? token,
    bool file = false,
  }) async {
    final server = serverUrl ?? this.serverUrl;
    if (server == null) {
      throw const ApiError(
        code: ApiError.network,
        message: 'No server address is set.',
      );
    }
    final usesSession = serverUrl == null && token == null;
    try {
      return await perform(
        ApiRequest(
          method: method,
          path: path,
          serverUrl: server,
          query: query,
          body: body,
          token: token ?? (serverUrl == null ? this.token : null),
          file: file,
        ),
      );
    } on ApiError catch (error) {
      // The check is on the code, never on HTTP 401: a wrong password is a 401 too.
      if (error.code == ApiError.unauthenticated && usesSession) {
        onUnauthenticated?.call();
      }
      rethrow;
    } on FormatException {
      throw const ApiError(
        code: ApiError.invalidResponse,
        message: 'The server sent an answer the app could not read.',
      );
    }
  }

  Future<ApiResponse> get(String path, {Map<String, String> query = const {}}) {
    return send('GET', path, query: query);
  }

  /// A route that answers a file (`GET /quotes/:id/pdf`). An answer that is not a file is
  /// `INVALID_RESPONSE`.
  Future<ApiFile> getFile(
    String path, {
    Map<String, String> query = const {},
  }) async {
    final data = (await send('GET', path, query: query, file: true)).data;
    if (data is ApiFile) {
      return data;
    }
    throw const ApiError(
      code: ApiError.invalidResponse,
      message: 'The server sent an answer the app could not read.',
    );
  }

  Future<ApiResponse> post(String path, {Object? body}) =>
      send('POST', path, body: body);

  Future<ApiResponse> patch(String path, {Object? body}) =>
      send('PATCH', path, body: body);

  Future<ApiResponse> put(String path, {Object? body}) =>
      send('PUT', path, body: body);

  Future<ApiResponse> delete(String path) => send('DELETE', path);
}

/// The app's API client. Tests override this with a `FakeApi`.
final apiClientProvider = Provider<ApiClient>((ref) => DioApiClient());
