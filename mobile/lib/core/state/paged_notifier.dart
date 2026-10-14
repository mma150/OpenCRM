import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';

/// What a paged list is showing. One class for every list in the app, so
/// `PagedListView` can draw any of them.
class PagedState<T> {
  const PagedState({
    this.items = const [],
    this.total = 0,
    this.page = 0,
    this.hasMore = false,
    this.isLoading = false,
    this.error,
    this.isLoadingMore = false,
    this.moreError,
  });

  /// The rows loaded so far, every page in order.
  final List<T> items;

  /// Every match on the server, not only the rows loaded.
  final int total;

  /// The last page loaded; 0 before the first answer.
  final int page;

  /// The server has rows after the last page loaded.
  final bool hasMore;

  /// The first page is on its way and there is nothing to show yet.
  final bool isLoading;

  /// The first page failed: the whole list is an error with Retry.
  final ApiError? error;

  final bool isLoadingMore;

  /// A later page failed: the rows stay, with Retry under them.
  final ApiError? moreError;

  bool get isEmpty => !isLoading && error == null && items.isEmpty;

  PagedState<T> copyWith({
    List<T>? items,
    int? total,
    int? page,
    bool? isLoadingMore,
    ApiError? moreError,
    bool clearMoreError = false,
  }) {
    return PagedState(
      items: items ?? this.items,
      total: total ?? this.total,
      page: page ?? this.page,
      hasMore: hasMore,
      isLoading: isLoading,
      error: error,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      moreError: clearMoreError ? null : (moreError ?? this.moreError),
    );
  }
}

/// The controller behind every paged list: first page, pull to refresh, next page.
/// A feature extends it and says how one page is fetched:
///
/// ```dart
/// class LeadsListController extends PagedNotifier<Lead> {
///   @override
///   PagedState<Lead> build() {
///     _query = ref.watch(leadsQueryProvider); // a new search starts the list again
///     return start();
///   }
///
///   @override
///   Future<Page<Lead>> fetchPage(int page) => ref.read(leadsApiProvider).list(_query, page);
/// }
/// ```
abstract class PagedNotifier<T> extends Notifier<PagedState<T>> {
  /// Counts the lists started. An answer that belongs to an earlier one (the search has
  /// changed since, the list was refreshed) is dropped.
  int _generation = 0;

  Future<Page<T>> fetchPage(int page);

  /// Call from `build`: starts loading the first page and returns the loading state.
  PagedState<T> start() {
    // The rows belong to the signed-in user: someone else signing in starts the list again.
    ref.watch(sessionUserIdProvider);
    _generation += 1;
    // After build has returned, so the state may be set.
    Future.microtask(() => _loadFirst(_generation));
    return const PagedState(isLoading: true);
  }

  Future<void> _loadFirst(int generation) async {
    try {
      final first = await fetchPage(1);
      if (generation == _generation && ref.mounted) {
        state = _firstPage(first);
      }
    } catch (error) {
      if (generation == _generation && ref.mounted) {
        state = PagedState(error: ApiError.from(error));
      }
    }
  }

  PagedState<T> _firstPage(Page<T> first) {
    return PagedState(
      items: first.items,
      total: first.meta.total,
      page: 1,
      hasMore: first.meta.hasMore,
    );
  }

  /// The Retry button of a list that failed to load.
  Future<void> retry() async {
    _generation += 1;
    state = const PagedState(isLoading: true);
    await _loadFirst(_generation);
  }

  /// Pull to refresh: the rows stay on screen until the new first page arrives. A failure
  /// keeps them too, and is thrown so the screen can say so.
  Future<void> refresh() async {
    _generation += 1;
    final generation = _generation;
    if (state.items.isEmpty) {
      state = const PagedState(isLoading: true);
      return _loadFirst(generation);
    }
    try {
      final first = await fetchPage(1);
      if (generation == _generation && ref.mounted) {
        state = _firstPage(first);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// The next page, added under the rows already shown. Does nothing while a page is
  /// loading or when every row is loaded, so a scroll listener may call it freely.
  Future<void> loadMore() async {
    if (state.isLoading ||
        state.isLoadingMore ||
        !state.hasMore ||
        state.error != null) {
      return;
    }
    final generation = _generation;
    final nextPage = state.page + 1;
    state = state.copyWith(isLoadingMore: true, clearMoreError: true);
    try {
      final next = await fetchPage(nextPage);
      if (generation != _generation || !ref.mounted) {
        return;
      }
      // A row that moved onto this page since the last one was read is not shown twice.
      final known = {for (final item in state.items) idOf(item)};
      state = PagedState(
        items: [
          ...state.items,
          ...next.items.where((item) => !known.contains(idOf(item))),
        ],
        total: next.meta.total,
        page: nextPage,
        hasMore: next.meta.hasMore,
      );
    } catch (error) {
      if (generation == _generation && ref.mounted) {
        state = state.copyWith(
          isLoadingMore: false,
          moreError: ApiError.from(error),
        );
      }
    }
  }

  /// What makes a row itself, so paging never shows one twice.
  Object idOf(T item);
}
