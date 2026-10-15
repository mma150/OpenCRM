import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/features/emails/email.dart';
import 'package:opencrm/features/opportunities/opportunities_providers.dart';
import 'package:opencrm/features/quotes/quote.dart';
import 'package:opencrm/features/quotes/quotes_api.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

/// The newest quotes of one opportunity, for its Quotes card.
final opportunityQuotesProvider = FutureProvider.autoDispose
    .family<Page<Quote>, String>((ref, opportunityId) {
      ref.watch(sessionUserIdProvider);
      return ref.watch(quotesApiProvider).ofOpportunity(opportunityId);
    });

/// One quote, and the one change the app makes to it: sending it by email. Its screen
/// watches this. Making, editing, accepting and declining quotes stay in the web app.
class QuoteController extends AsyncNotifier<Quote> {
  QuoteController(this.id);

  final String id;

  QuotesApi get _api => ref.read(quotesApiProvider);

  @override
  Future<Quote> build() {
    ref.watch(sessionUserIdProvider);
    return _api.get(id);
  }

  /// Reads the quote again, keeping what is on screen until the answer arrives: pull to
  /// refresh, and after the API said the quote is no longer what the screen shows.
  Future<void> reload() async {
    try {
      final quote = await _api.get(id);
      if (ref.mounted) {
        state = AsyncData(quote);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// Emails the quote with its PDF attached (`POST /quotes/:id/send`). A draft becomes
  /// sent. Throws the `ApiError` for the email sheet to show; on success the quote, its
  /// opportunity (the email moved its "last contact"), the opportunity's Quotes card and
  /// its timeline (the `EMAIL` entry, and `QUOTE_STATUS` for a draft) load again.
  Future<void> sendByEmail(EmailMessage email) async {
    final quote = await _api.sendByEmail(id, email);
    if (!ref.mounted) {
      return;
    }
    state = AsyncData(quote);
    quoteSent(ref, quote.opportunity.id);
  }
}

final quoteProvider = AsyncNotifierProvider.autoDispose
    .family<QuoteController, Quote, String>(QuoteController.new);

/// Call after a quote of [opportunityId] was sent: the screens that show what changed load
/// again.
void quoteSent(Ref ref, String opportunityId) {
  ref.invalidate(opportunityQuotesProvider(opportunityId));
  ref.invalidate(opportunityProvider(opportunityId));
  refreshTimelines(ref, RecordRef(RecordType.opportunity, opportunityId));
}
