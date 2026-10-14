import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';

/// The `meta` of every list the API pages: `{ page, pageSize, total }`.
class ListMeta {
  const ListMeta({
    required this.page,
    required this.pageSize,
    required this.total,
  });

  factory ListMeta.fromJson(Json json) {
    return ListMeta(
      page: readInt(json, 'page'),
      pageSize: readInt(json, 'pageSize'),
      total: readInt(json, 'total'),
    );
  }

  final int page;
  final int pageSize;

  /// Every match the caller may see, not only this page.
  final int total;

  bool get hasMore => page * pageSize < total;
}

/// One page of a list.
class Page<T> {
  const Page({required this.items, required this.meta});

  /// Reads a list answer: `data` is the rows, `meta` the paging.
  factory Page.fromResponse(
    ApiResponse response,
    T Function(Json json) fromJson,
  ) {
    return Page(
      items: readList(response.data, fromJson),
      meta: ListMeta.fromJson(response.meta),
    );
  }

  final List<T> items;
  final ListMeta meta;
}

/// How many rows the app asks for at a time. The API's default, and at most 100.
const defaultPageSize = 25;

/// The query string every list of the API shares (backend.md, "List endpoints"): search,
/// sort, order, page, pageSize, and filters named after their field.
class ListQuery {
  const ListQuery({
    this.search = '',
    this.sort,
    this.order,
    this.page = 1,
    this.pageSize = defaultPageSize,
    this.filters = const {},
  });

  final String search;
  final String? sort;

  /// `asc` or `desc`.
  final String? order;
  final int page;
  final int pageSize;

  /// A filter with a null or empty value is left out, like a filter box that was cleared.
  final Map<String, String?> filters;

  Map<String, String> toQuery() {
    final trimmed = search.trim();
    return {
      'page': '$page',
      'pageSize': '$pageSize',
      if (trimmed.isNotEmpty) 'search': trimmed,
      'sort': ?sort,
      'order': ?order,
      for (final MapEntry(:key, :value) in filters.entries)
        if (value != null && value.isNotEmpty) key: value,
    };
  }
}
