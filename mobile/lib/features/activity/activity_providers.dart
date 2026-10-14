import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/activity/activity_entry.dart';

/// The activity routes of the API. Admins, Sales Managers and Read-only users only; the API answers
/// `FORBIDDEN` to a Sales Rep.
class ActivityApi {
  const ActivityApi(this._client);

  final ApiClient _client;

  /// What the team did, newest first: an Admin sees everyone's entries, a Sales Manager
  /// their own and their team's. The order is the server's.
  Future<Page<ActivityEntry>> list(ActivityKind kind, int page) async {
    final query = ListQuery(page: page, filters: {'kind': kind.apiValue});
    final response = await _client.get('/activity', query: query.toQuery());
    return Page.fromResponse(response, ActivityEntry.fromJson);
  }
}

final activityApiProvider = Provider(
  (ref) => ActivityApi(ref.watch(apiClientProvider)),
);

/// The Type filter of the feed. Changing it starts the feed again.
class ActivityKindController extends Notifier<ActivityKind> {
  @override
  ActivityKind build() {
    ref.watch(sessionUserIdProvider);
    return ActivityKind.all;
  }

  void choose(ActivityKind kind) => state = kind;
}

final activityKindProvider =
    NotifierProvider<ActivityKindController, ActivityKind>(
      ActivityKindController.new,
    );

/// The activity feed, page by page, for the type in [activityKindProvider].
///
/// **Never asked for a Sales Rep** (`Role.seesTeamOverview`): for them a page fails here,
/// before any request is made.
class ActivityController extends PagedNotifier<ActivityEntry> {
  late ActivityKind _kind;

  @override
  PagedState<ActivityEntry> build() {
    _kind = ref.watch(activityKindProvider);
    return start();
  }

  @override
  Future<Page<ActivityEntry>> fetchPage(int page) async {
    if (!ref.read(currentUserProvider).role.seesTeamOverview) {
      throw const ApiError(
        code: 'FORBIDDEN',
        message: 'The activity feed is for Admins, Sales Managers and Read-only users.',
      );
    }
    return ref.read(activityApiProvider).list(_kind, page);
  }

  @override
  Object idOf(ActivityEntry item) => item.entry.id;
}

final activityProvider =
    NotifierProvider<ActivityController, PagedState<ActivityEntry>>(
      ActivityController.new,
    );
