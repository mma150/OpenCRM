import 'package:flutter/material.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';

/// The one list pattern: pull to refresh, the next page when the end comes near, and the
/// loading, empty and error states. Give it a [PagedState] and the three actions of its
/// `PagedNotifier`; it draws each row with [itemBuilder].
class PagedListView<T> extends StatefulWidget {
  const PagedListView({
    super.key,
    required this.state,
    required this.onRefresh,
    required this.onLoadMore,
    required this.onRetry,
    required this.itemBuilder,
    required this.loadingLabel,
    required this.emptyTitle,
    this.emptyMessage,
    this.emptyAction,
    this.header,
  });

  final PagedState<T> state;
  final Future<void> Function() onRefresh;
  final VoidCallback onLoadMore;
  final VoidCallback onRetry;
  final Widget Function(BuildContext context, T item) itemBuilder;

  /// What a screen reader hears while the first page loads: "Loading leads".
  final String loadingLabel;
  final String emptyTitle;
  final String? emptyMessage;
  final Widget? emptyAction;

  /// Scrolls away with the list: a count, a hint.
  final Widget? header;

  @override
  State<PagedListView<T>> createState() => _PagedListViewState<T>();
}

class _PagedListViewState<T> extends State<PagedListView<T>> {
  /// How long the list was when the next page was last asked for. Until the new rows are
  /// laid out the list still looks short, and scrolling must not ask for a page again.
  double? _askedAtExtent;

  PagedState<T> get state => widget.state;

  @override
  void didUpdateWidget(PagedListView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The list started again (a new search, a refresh): forget the old length.
    if (widget.state.page <= 1) {
      _askedAtExtent = null;
    }
  }

  Future<void> _refresh() async {
    try {
      await widget.onRefresh();
    } on ApiError catch (error) {
      if (mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  bool _onScroll(ScrollNotification notification) {
    final metrics = notification.metrics;
    // Ask for the next page a little before the end is reached. After a failure the
    // Retry button asks, not the scrolling.
    if (metrics.axis == Axis.vertical &&
        metrics.extentAfter < 400 &&
        state.hasMore &&
        state.moreError == null &&
        metrics.maxScrollExtent != _askedAtExtent) {
      _askedAtExtent = metrics.maxScrollExtent;
      widget.onLoadMore();
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: CustomScrollView(
          // Always scrollable, so pull to refresh works on a short or empty list.
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.all(AppSpacing.page),
              sliver: _content(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content(BuildContext context) {
    final error = state.error;
    if (state.isLoading) {
      return SliverToBoxAdapter(
        child: SkeletonList(label: widget.loadingLabel),
      );
    }
    if (error != null) {
      return SliverToBoxAdapter(
        child: ErrorState(error: error, onRetry: widget.onRetry),
      );
    }
    if (state.items.isEmpty) {
      return SliverToBoxAdapter(
        child: EmptyState(
          title: widget.emptyTitle,
          message: widget.emptyMessage,
          action: widget.emptyAction,
        ),
      );
    }
    final moreError = state.moreError;
    return SliverMainAxisGroup(
      slivers: [
        if (widget.header != null) SliverToBoxAdapter(child: widget.header),
        // Rows are built as they scroll into view, so a long list stays cheap.
        SliverList.builder(
          itemCount: state.items.length,
          itemBuilder: (context, index) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: widget.itemBuilder(context, state.items[index]),
          ),
        ),
        if (state.isLoadingMore)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.lg),
              child: Center(
                child: SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    semanticsLabel: 'Loading more',
                  ),
                ),
              ),
            ),
          ),
        if (moreError != null)
          SliverToBoxAdapter(
            child: ErrorState(
              error: moreError,
              onRetry: widget.onLoadMore,
              compact: true,
            ),
          ),
      ],
    );
  }
}
