import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/companies/companies_api.dart';
import 'package:opencrm/features/companies/company.dart';
import 'package:opencrm/features/contacts/contacts_providers.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

/// The search, filter and order of the companies list. Changing it starts the list again.
class CompaniesQueryController extends Notifier<CompaniesQuery> {
  @override
  CompaniesQuery build() {
    // The next person to sign in starts with no search and no filter.
    ref.watch(sessionUserIdProvider);
    return const CompaniesQuery();
  }

  void search(String text) {
    state = CompaniesQuery(
      search: text,
      industry: state.industry,
      sort: state.sort,
    );
  }

  void filterByIndustry(String? industry) {
    state = CompaniesQuery(
      search: state.search,
      industry: industry,
      sort: state.sort,
    );
  }

  void sortBy(CompanySort sort) {
    state = CompaniesQuery(
      search: state.search,
      industry: state.industry,
      sort: sort,
    );
  }
}

final companiesQueryProvider =
    NotifierProvider<CompaniesQueryController, CompaniesQuery>(
      CompaniesQueryController.new,
    );

/// The companies list, page by page, for the query in [companiesQueryProvider].
class CompaniesListController extends PagedNotifier<Company> {
  late CompaniesQuery _query;

  @override
  PagedState<Company> build() {
    _query = ref.watch(companiesQueryProvider);
    return start();
  }

  @override
  Future<Page<Company>> fetchPage(int page) =>
      ref.read(companiesApiProvider).list(_query, page);

  @override
  Object idOf(Company item) => item.id;
}

final companiesListProvider =
    NotifierProvider<CompaniesListController, PagedState<Company>>(
      CompaniesListController.new,
    );

/// The industries in use among the companies the signed-in user may see: the chips of the
/// list's filter and the suggestions of the form.
final companyIndustriesProvider = FutureProvider<List<String>>((ref) {
  ref.watch(sessionUserIdProvider);
  return ref.watch(companiesApiProvider).industries();
});

/// One company and everything that changes it. The page of a company watches this; the
/// form and the Reassign sheet call a method and show the `ApiError` it throws.
class CompanyController extends AsyncNotifier<Company> {
  CompanyController(this.id);

  final String id;

  CompaniesApi get _api => ref.read(companiesApiProvider);

  @override
  Future<Company> build() {
    ref.watch(sessionUserIdProvider);
    return _api.get(id);
  }

  /// Reads the company again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    try {
      final company = await _api.get(id);
      if (ref.mounted) {
        state = AsyncData(company);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// Pull to refresh: the company, its contacts and its timeline.
  Future<void> refresh() async {
    refreshTimelines(ref, RecordRef(RecordType.company, id));
    ref.invalidate(companyContactsProvider(id));
    await reload();
  }

  void _changed(Company company, {bool wroteTimeline = false}) {
    if (!ref.mounted) {
      return;
    }
    state = AsyncData(company);
    companiesChanged(ref);
    if (wroteTimeline) {
      refreshTimelines(ref, RecordRef(RecordType.company, id));
    }
  }

  Future<void> save(CompanyInput input) async =>
      _changed(await _api.update(id, input));

  Future<void> assign(String ownerId) async {
    _changed(await _api.assign(id, ownerId), wroteTimeline: true);
  }

  Future<void> delete() async {
    await _api.delete(id);
    if (ref.mounted) {
      companiesChanged(ref);
    }
  }
}

final companyProvider = AsyncNotifierProvider.autoDispose
    .family<CompanyController, Company, String>(CompanyController.new);

/// Call after a company was created, changed or deleted: everything that lists companies
/// or names one loads again (a contact's row shows its company's name).
void companiesChanged(Ref ref) {
  ref.invalidate(companiesListProvider);
  ref.invalidate(companyIndustriesProvider);
  ref.invalidate(contactsListProvider);
}

/// Creates a company, owned by the signed-in user. The "New company" form calls this.
class CompanyCreator {
  const CompanyCreator(this._ref);

  final Ref _ref;

  Future<Company> create(CompanyInput input) async {
    final company = await _ref.read(companiesApiProvider).create(input);
    companiesChanged(_ref);
    return company;
  }
}

final companyCreatorProvider = Provider(CompanyCreator.new);
