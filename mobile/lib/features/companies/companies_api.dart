import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/features/companies/company.dart';

/// How the companies list can be sorted: the words shown (the web app's), and the API's
/// `sort` and `order`.
enum CompanySort {
  nameAz('Name A–Z', 'name', 'asc'),
  nameZa('Name Z–A', 'name', 'desc'),
  industry('Industry A–Z', 'industry', 'asc'),
  newest('Newest first', 'createdAt', 'desc'),
  oldest('Oldest first', 'createdAt', 'asc'),
  recentlyUpdated('Recently updated', 'updatedAt', 'desc');

  const CompanySort(this.label, this.field, this.order);

  final String label;
  final String field;
  final String order;
}

/// What the companies list is showing: the search, the industry filter and the order.
class CompaniesQuery {
  const CompaniesQuery({
    this.search = '',
    this.industry,
    this.sort = CompanySort.nameAz,
  });

  final String search;

  /// Null shows every industry.
  final String? industry;
  final CompanySort sort;

  ListQuery toListQuery(int page, {int pageSize = defaultPageSize}) {
    return ListQuery(
      search: search,
      sort: sort.field,
      order: sort.order,
      page: page,
      pageSize: pageSize,
      filters: {'industry': industry},
    );
  }
}

/// The company routes of the API. Each function returns the unwrapped data; a failure is
/// an `ApiError`.
class CompaniesApi {
  const CompaniesApi(this._client);

  final ApiClient _client;

  Company _company(ApiResponse response) =>
      Company.fromJson(asMap(response.data));

  Future<Page<Company>> list(
    CompaniesQuery query,
    int page, {
    int pageSize = defaultPageSize,
  }) async {
    final response = await _client.get(
      '/companies',
      query: query.toListQuery(page, pageSize: pageSize).toQuery(),
    );
    return Page.fromResponse(response, Company.fromJson);
  }

  /// The industries in use among the companies the caller may see, for the Industry
  /// filter and the form's suggestions.
  Future<List<String>> industries() async {
    final response = await _client.get('/companies/industries');
    return [for (final industry in asList(response.data)) industry.toString()];
  }

  Future<Company> get(String id) async =>
      _company(await _client.get('/companies/$id'));

  /// The new company is owned by the caller.
  Future<Company> create(CompanyInput input) async {
    return _company(await _client.post('/companies', body: input.toJson()));
  }

  Future<Company> update(String id, CompanyInput input) async {
    return _company(
      await _client.patch('/companies/$id', body: input.toJson()),
    );
  }

  /// Admins and Sales Managers only.
  Future<Company> assign(String id, String ownerId) async {
    return _company(
      await _client.post('/companies/$id/assign', body: {'ownerId': ownerId}),
    );
  }

  /// The company's contacts stay, without a company.
  Future<void> delete(String id) async {
    await _client.delete('/companies/$id');
  }
}

final companiesApiProvider = Provider(
  (ref) => CompaniesApi(ref.watch(apiClientProvider)),
);
