import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/home/dashboard_providers.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_api.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

/// The search, filter and order of the leads list. Changing it starts the list again.
class LeadsQueryController extends Notifier<LeadsQuery> {
  @override
  LeadsQuery build() {
    // The next person to sign in starts with no search and no filter.
    ref.watch(sessionUserIdProvider);
    return const LeadsQuery();
  }

  void search(String text) {
    state = LeadsQuery(search: text, status: state.status, sort: state.sort);
  }

  void filterByStatus(LeadStatus? status) {
    state = LeadsQuery(search: state.search, status: status, sort: state.sort);
  }

  void sortBy(LeadSort sort) {
    state = LeadsQuery(search: state.search, status: state.status, sort: sort);
  }
}

final leadsQueryProvider = NotifierProvider<LeadsQueryController, LeadsQuery>(
  LeadsQueryController.new,
);

/// The leads list, page by page, for the query in [leadsQueryProvider].
class LeadsListController extends PagedNotifier<Lead> {
  late LeadsQuery _query;

  @override
  PagedState<Lead> build() {
    _query = ref.watch(leadsQueryProvider);
    return start();
  }

  @override
  Future<Page<Lead>> fetchPage(int page) =>
      ref.read(leadsApiProvider).list(_query, page);

  @override
  Object idOf(Lead item) => item.id;
}

final leadsListProvider =
    NotifierProvider<LeadsListController, PagedState<Lead>>(
      LeadsListController.new,
    );

/// One lead and everything that changes it. The page of a lead watches this; a form or a
/// sheet calls a method and shows the `ApiError` it throws.
///
/// Every change answers with the lead as the server now has it, and then tells the rest of
/// the app: the leads list and the dashboard load again, and so does the lead's timeline
/// when the change wrote an entry on it.
class LeadController extends AsyncNotifier<Lead> {
  LeadController(this.id);

  final String id;

  LeadsApi get _api => ref.read(leadsApiProvider);

  @override
  Future<Lead> build() {
    ref.watch(sessionUserIdProvider);
    return _api.get(id);
  }

  /// Reads the lead again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    try {
      final lead = await _api.get(id);
      if (ref.mounted) {
        state = AsyncData(lead);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// Pull to refresh: the lead and its timeline.
  Future<void> refresh() async {
    refreshTimelines(ref, RecordRef(RecordType.lead, id));
    await reload();
  }

  void _changed(Lead lead, {bool wroteTimeline = false}) {
    if (!ref.mounted) {
      return;
    }
    state = AsyncData(lead);
    leadsChanged(ref);
    if (wroteTimeline) {
      refreshTimelines(ref, RecordRef(RecordType.lead, id));
    }
  }

  Future<void> save(LeadInput input) async =>
      _changed(await _api.update(id, input));

  Future<void> changeStatus(LeadStatus status) async {
    _changed(await _api.changeStatus(id, status), wroteTimeline: true);
  }

  Future<void> markLost({required LostReason reason, String? note}) async {
    _changed(
      await _api.markLost(id, reason: reason, note: note),
      wroteTimeline: true,
    );
  }

  Future<void> assign(String ownerId) async {
    _changed(await _api.assign(id, ownerId), wroteTimeline: true);
  }

  Future<void> setFollowUp({required DateTime? at, String? note}) async {
    _changed(await _api.setFollowUp(id, at: at, note: note));
  }

  Future<void> delete() async {
    await _api.delete(id);
    if (ref.mounted) {
      leadsChanged(ref);
    }
  }
}

final leadProvider = AsyncNotifierProvider.autoDispose
    .family<LeadController, Lead, String>(LeadController.new);

/// Call after a lead was created, changed or deleted: everything that lists or counts
/// leads loads again.
void leadsChanged(Ref ref) {
  ref.invalidate(leadsListProvider);
  ref.invalidate(dashboardProvider);
}

/// Creates a lead, owned by the signed-in user. The "New lead" form calls this.
class LeadCreator {
  const LeadCreator(this._ref);

  final Ref _ref;

  Future<Lead> create(LeadInput input) async {
    final lead = await _ref.read(leadsApiProvider).create(input);
    leadsChanged(_ref);
    return lead;
  }
}

final leadCreatorProvider = Provider(LeadCreator.new);
