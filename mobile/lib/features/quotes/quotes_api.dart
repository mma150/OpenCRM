import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/emails/email.dart';
import 'package:opencrm/features/quotes/quote.dart';

/// How many quotes the Quotes card of an opportunity shows, newest first, as on the web.
const opportunityQuotesShown = 10;

/// A quote's PDF as the server made it: the bytes and the name to share it under.
class QuotePdf {
  const QuotePdf({required this.bytes, required this.fileName});

  final Uint8List bytes;

  /// `Q-0001.pdf`.
  final String fileName;
}

/// The quote routes the app uses. Each function returns the unwrapped data; a failure is
/// an `ApiError`.
///
/// Every quote route takes the viewer's time zone (`tz`), because whether a sent quote
/// reads as `EXPIRED` depends on the viewer's day (backend.md, "Quotes").
class QuotesApi {
  const QuotesApi(this._client);

  final ApiClient _client;

  Map<String, String> get _tz => {'tz': deviceTimeZone()};

  Quote _quote(ApiResponse response) => Quote.fromJson(asMap(response.data));

  /// The quotes of one opportunity, newest first.
  Future<Page<Quote>> ofOpportunity(
    String opportunityId, {
    int count = opportunityQuotesShown,
  }) async {
    final query = ListQuery(
      sort: 'createdAt',
      order: 'desc',
      pageSize: count,
      filters: {'opportunityId': opportunityId},
    );
    final response = await _client.get(
      '/quotes',
      query: {...query.toQuery(), ..._tz},
    );
    return Page.fromResponse(response, Quote.fromJson);
  }

  Future<Quote> get(String id) async =>
      _quote(await _client.get('/quotes/$id', query: _tz));

  /// The quote as a PDF (`GET /quotes/:id/pdf`), made by the server. An answer that is not
  /// a PDF is `INVALID_RESPONSE`. [number] names the file when the server gives no name.
  Future<QuotePdf> pdf(String id, {required String number}) async {
    final file = await _client.getFile('/quotes/$id/pdf');
    final type = file.contentType?.toLowerCase() ?? '';
    if (!type.startsWith('application/pdf') || file.bytes.isEmpty) {
      throw const ApiError(
        code: ApiError.invalidResponse,
        message: 'The server did not send a PDF.',
      );
    }
    final given = file.fileName;
    return QuotePdf(
      bytes: file.bytes,
      fileName: given == null || !given.toLowerCase().endsWith('.pdf')
          ? quotePdfFileName(number)
          : quotePdfFileName(given.substring(0, given.length - 4)),
    );
  }

  /// Emails the quote with its PDF attached (the server attaches it). A draft becomes
  /// sent; a sent or expired quote stays sent. Answers with the quote as it now is.
  Future<Quote> sendByEmail(String id, EmailMessage email) async {
    return _quote(
      await _client.send(
        'POST',
        '/quotes/$id/send',
        query: _tz,
        body: {'email': email.toJson()},
      ),
    );
  }
}

final quotesApiProvider = Provider(
  (ref) => QuotesApi(ref.watch(apiClientProvider)),
);
