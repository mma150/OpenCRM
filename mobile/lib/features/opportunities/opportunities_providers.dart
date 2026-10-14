import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/home/dashboard_providers.dart';
import 'package:opencrm/features/opportunities/opportunities_api.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

/// The two ways the Opportunities screen shows the same records.
enum OpportunitiesView {
  pipeline('Pipeline'),
  list('List');

  const OpportunitiesView(this.label);

  final String label;
}

/// Which of the two the screen is showing. The pipeline first.
class OpportunitiesViewController extends Notifier<OpportunitiesView> {
  @override
  OpportunitiesView build() {
    ref.watch(sessionUserIdProvider);
    return OpportunitiesView.pipeline;
  }

  void show(OpportunitiesView view) => state = view;
}

final opportunitiesViewProvider =
    NotifierProvider<OpportunitiesViewController, OpportunitiesView>(
      OpportunitiesViewController.new,
    );

/// The search, filters and order of the opportunities list. Changing it starts the list
/// again.
class OpportunitiesQueryController extends Notifier<OpportunitiesQuery> {
  @override
  OpportunitiesQuery build() {
    // The next person to sign in starts with no search and no filter.
    ref.watch(sessionUserIdProvider);
    return const OpportunitiesQuery();
  }

  void search(String text) {
    state = OpportunitiesQuery(
      search: text,
      stageId: state.stageId,
      status: state.status,
      sort: state.sort,
    );
  }

  void filterByStage(String? stageId) {
    state = OpportunitiesQuery(
      search: state.search,
      stageId: stageId,
      status: state.status,
      sort: state.sort,
    );
  }

  void filterByStatus(StageKind? status) {
    state = OpportunitiesQuery(
      search: state.search,
      stageId: state.stageId,
      status: status,
      sort: state.sort,
    );
  }

  void sortBy(OpportunitySort sort) {
    state = OpportunitiesQuery(
      search: state.search,
      stageId: state.stageId,
      status: state.status,
      sort: sort,
    );
  }

  /// One stage and nothing else: where the pipeline sends the user for the cards a stage
  /// does not show.
  void showStage(String stageId) {
    state = OpportunitiesQuery(stageId: stageId, sort: state.sort);
  }
}

final opportunitiesQueryProvider =
    NotifierProvider<OpportunitiesQueryController, OpportunitiesQuery>(
      OpportunitiesQueryController.new,
    );

/// The opportunities list, page by page, for the query in [opportunitiesQueryProvider].
class OpportunitiesListController extends PagedNotifier<Opportunity> {
  late OpportunitiesQuery _query;

  @override
  PagedState<Opportunity> build() {
    _query = ref.watch(opportunitiesQueryProvider);
    return start();
  }

  @override
  Future<Page<Opportunity>> fetchPage(int page) =>
      ref.read(opportunitiesApiProvider).list(_query, page);

  @override
  Object idOf(Opportunity item) => item.id;
}

final opportunitiesListProvider =
    NotifierProvider<OpportunitiesListController, PagedState<Opportunity>>(
      OpportunitiesListController.new,
    );

/// The pipeline board: one column per stage, and the three things a card's "Move to
/// stage" sheet does.
///
/// **A move shows at once.** It is the one optimistic update in the app: a card that waits
/// for the server before it changes column feels broken on a board. [move] puts the card in
/// its new stage straight away, and puts it back where it was if the API refuses, throwing
/// the error so the screen can say so. Closing and reopening wait for the answer, as every
/// other change does: closing has a sheet that shows the error.
class BoardController extends AsyncNotifier<List<BoardColumn>> {
  OpportunitiesApi get _api => ref.read(opportunitiesApiProvider);

  @override
  Future<List<BoardColumn>> build() {
    ref.watch(sessionUserIdProvider);
    return _api.board();
  }

  /// Pull to refresh: the board stays on screen until the new one arrives.
  Future<void> refresh() async {
    try {
      final columns = await _api.board();
      if (ref.mounted) {
        state = AsyncData(columns);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// Puts the card where the server says it is, and tells the screens that show the same
  /// opportunity elsewhere.
  void _moved(Opportunity opportunity) {
    if (!ref.mounted) {
      return;
    }
    final columns = state.value;
    if (columns != null) {
      state = AsyncData(placeCard(columns, opportunity));
    }
    ref.invalidate(opportunitiesListProvider);
    ref.invalidate(dashboardProvider);
    ref.invalidate(opportunityProvider(opportunity.id));
    refreshTimelines(ref, RecordRef(RecordType.opportunity, opportunity.id));
  }

  /// Moves a card to another open stage: at once on screen, then on the server.
  Future<void> move(Opportunity opportunity, Stage stage) async {
    final before = state.value;
    if (before == null) {
      return;
    }
    // Where the card was, so a refused move puts it back in the same place.
    final index = before
        .expand((column) => column.opportunities)
        .where((card) => card.stage.id == opportunity.stage.id)
        .toList()
        .indexWhere((card) => card.id == opportunity.id);
    state = AsyncData(placeCard(before, opportunity.inStage(stage)));
    try {
      _moved(await _api.move(opportunity.id, stage.id));
    } catch (error) {
      final columns = state.value;
      if (ref.mounted && columns != null) {
        state = AsyncData(
          placeCard(columns, opportunity, index: index < 0 ? 0 : index),
        );
      }
      throw ApiError.from(error);
    }
  }

  Future<void> close(
    Opportunity opportunity, {
    required CloseOutcome outcome,
    String? reason,
  }) async {
    _moved(await _api.close(opportunity.id, outcome: outcome, reason: reason));
  }

  /// Back to the first open stage. Answers with the opportunity, for the stage's name.
  Future<Opportunity> reopen(Opportunity opportunity) async {
    final reopened = await _api.reopen(opportunity.id);
    _moved(reopened);
    return reopened;
  }
}

final boardProvider = AsyncNotifierProvider<BoardController, List<BoardColumn>>(
  BoardController.new,
);

/// One opportunity and everything that changes it. Its page watches this; a form or a
/// sheet calls a method and shows the `ApiError` it throws.
///
/// Every change answers with the opportunity as the server now has it, and then tells the
/// rest of the app: the list, the board and the dashboard load again, and so does the
/// opportunity's timeline when the change wrote an entry on it.
class OpportunityController extends AsyncNotifier<Opportunity> {
  OpportunityController(this.id);

  final String id;

  OpportunitiesApi get _api => ref.read(opportunitiesApiProvider);

  RecordRef get _record => RecordRef(RecordType.opportunity, id);

  @override
  Future<Opportunity> build() {
    ref.watch(sessionUserIdProvider);
    return _api.get(id);
  }

  /// Reads the opportunity again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    try {
      final opportunity = await _api.get(id);
      if (ref.mounted) {
        state = AsyncData(opportunity);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// Pull to refresh: the opportunity and its timeline.
  Future<void> refresh() async {
    refreshTimelines(ref, _record);
    await reload();
  }

  Opportunity _changed(Opportunity opportunity, {bool wroteTimeline = false}) {
    if (ref.mounted) {
      state = AsyncData(opportunity);
      opportunitiesChanged(ref);
      if (wroteTimeline) {
        refreshTimelines(ref, _record);
      }
    }
    return opportunity;
  }

  /// [changes] is what `OpportunityInput.changesFrom` answers. Nothing changed, nothing
  /// is sent.
  Future<void> save(Map<String, dynamic> changes) async {
    if (changes.isNotEmpty) {
      _changed(await _api.update(id, changes));
    }
  }

  Future<void> move(Stage stage) async {
    _changed(await _api.move(id, stage.id), wroteTimeline: true);
  }

  Future<void> close({required CloseOutcome outcome, String? reason}) async {
    _changed(
      await _api.close(id, outcome: outcome, reason: reason),
      wroteTimeline: true,
    );
  }

  /// Answers with the opportunity, for the name of the stage it went back to.
  Future<Opportunity> reopen() async {
    return _changed(await _api.reopen(id), wroteTimeline: true);
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
      opportunitiesChanged(ref);
    }
  }
}

final opportunityProvider = AsyncNotifierProvider.autoDispose
    .family<OpportunityController, Opportunity, String>(
      OpportunityController.new,
    );

/// Call after an opportunity was created, changed or deleted: everything that lists or
/// counts opportunities loads again.
void opportunitiesChanged(Ref ref) {
  ref.invalidate(opportunitiesListProvider);
  ref.invalidate(boardProvider);
  ref.invalidate(dashboardProvider);
}

/// Creates an opportunity, owned by the signed-in user. The "New opportunity" form calls
/// this.
class OpportunityCreator {
  const OpportunityCreator(this._ref);

  final Ref _ref;

  Future<Opportunity> create(OpportunityInput input) async {
    final opportunity = await _ref.read(opportunitiesApiProvider).create(input);
    opportunitiesChanged(_ref);
    return opportunity;
  }
}

final opportunityCreatorProvider = Provider(OpportunityCreator.new);
