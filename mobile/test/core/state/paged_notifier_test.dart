import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/app.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/core/storage/key_value_store.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_providers.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';

/// `PagedNotifier` through the leads list, its first user.
Future<({ProviderContainer container, FakeApi api, void Function() start})>
_setUp() async {
  final api = FakeApi();
  final container = ProviderContainer(
    retry: noRetry,
    overrides: [
      apiClientProvider.overrideWithValue(api),
      // The auth controller reads the server address from here and hands it to the API.
      keyValueStoreProvider.overrideWithValue(
        MemoryKeyValueStore({'server_url': 'https://crm.example.test'}),
      ),
    ],
  );
  addTearDown(container.dispose);
  // In the app a list loads only behind the sign-in, when the API client has its server
  // address. Here: let the auth controller read the address first.
  container.listen(authControllerProvider, (_, _) {});
  await _settle();
  return (
    container: container,
    api: api,
    start: () {
      container.listen(leadsListProvider, (_, _) {});
    },
  );
}

List<Object?> _leads(int from, int count) {
  return [
    for (var index = from; index < from + count; index += 1)
      leadJson(id: 'lead-$index', firstName: 'Lead', lastName: '$index'),
  ];
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  PagedState<Lead> state(ProviderContainer container) {
    return container.read(leadsListProvider);
  }

  test('loads the first page', () async {
    final (:container, :api, :start) = await _setUp();
    api.on(
      'GET',
      '/leads',
      (request) => page(_leads(1, 2), total: 5, pageSize: 2),
    );

    start();
    expect(state(container).isLoading, true);
    await _settle();

    expect(state(container).isLoading, false);
    expect(state(container).items.map((lead) => lead.id), ['lead-1', 'lead-2']);
    expect(state(container).total, 5);
    expect(state(container).hasMore, true);
    expect(api.requests.single.query['page'], '1');
  });

  test('a first page that fails is an error, and retry loads it', () async {
    final (:container, :api, :start) = await _setUp();
    api.on('GET', '/leads', (request) => throw apiError(ApiError.network));
    start();
    await _settle();

    expect(state(container).error?.code, ApiError.network);
    expect(state(container).items, isEmpty);

    api.on('GET', '/leads', (request) => page(_leads(1, 1)));
    await container.read(leadsListProvider.notifier).retry();

    expect(state(container).error, isNull);
    expect(state(container).items, hasLength(1));
  });

  test('loadMore adds the next page and stops at the end', () async {
    final (:container, :api, :start) = await _setUp();
    api.on('GET', '/leads', (request) {
      final number = int.parse(request.query['page']!);
      return page(
        _leads((number - 1) * 2 + 1, number == 3 ? 1 : 2),
        total: 5,
        page: number,
        pageSize: 2,
      );
    });
    start();
    await _settle();
    final list = container.read(leadsListProvider.notifier);

    await list.loadMore();
    expect(state(container).items, hasLength(4));
    expect(state(container).hasMore, true);

    await list.loadMore();
    expect(state(container).items.map((lead) => lead.id).last, 'lead-5');
    expect(state(container).hasMore, false);

    await list.loadMore();
    expect(api.sent('GET', '/leads'), hasLength(3));
  });

  test('loadMore asks once while a page is on its way', () async {
    final (:container, :api, :start) = await _setUp();
    final secondPage = Completer<Object?>();
    api.on('GET', '/leads', (request) {
      return request.query['page'] == '1'
          ? page(_leads(1, 2), total: 4, pageSize: 2)
          : secondPage.future;
    });
    start();
    await _settle();
    final list = container.read(leadsListProvider.notifier);

    final first = list.loadMore();
    final second = list.loadMore();
    expect(state(container).isLoadingMore, true);
    secondPage.complete(page(_leads(3, 2), total: 4, page: 2, pageSize: 2));
    await Future.wait([first, second]);

    expect(api.sent('GET', '/leads'), hasLength(2));
    expect(state(container).items, hasLength(4));
  });

  test('a row that moved onto the next page is not shown twice', () async {
    final (:container, :api, :start) = await _setUp();
    api.on('GET', '/leads', (request) {
      return request.query['page'] == '1'
          ? page(_leads(1, 2), total: 4, pageSize: 2)
          : page(_leads(2, 2), total: 4, page: 2, pageSize: 2);
    });
    start();
    await _settle();

    await container.read(leadsListProvider.notifier).loadMore();

    expect(state(container).items.map((lead) => lead.id), [
      'lead-1',
      'lead-2',
      'lead-3',
    ]);
  });

  test('a later page that fails keeps the rows and can be retried', () async {
    final (:container, :api, :start) = await _setUp();
    var fail = true;
    api.on('GET', '/leads', (request) {
      if (request.query['page'] == '1') {
        return page(_leads(1, 2), total: 4, pageSize: 2);
      }
      if (fail) {
        throw apiError(ApiError.timeout);
      }
      return page(_leads(3, 2), total: 4, page: 2, pageSize: 2);
    });
    start();
    await _settle();
    final list = container.read(leadsListProvider.notifier);

    await list.loadMore();
    expect(state(container).moreError?.code, ApiError.timeout);
    expect(state(container).items, hasLength(2));
    expect(state(container).hasMore, true);

    fail = false;
    await list.loadMore();
    expect(state(container).moreError, isNull);
    expect(state(container).items, hasLength(4));
  });

  test('refresh keeps the rows until the new first page arrives', () async {
    final (:container, :api, :start) = await _setUp();
    api.on('GET', '/leads', (request) => page(_leads(1, 2)));
    start();
    await _settle();
    final answer = Completer<Object?>();
    api.on('GET', '/leads', (request) => answer.future);

    final refreshing = container.read(leadsListProvider.notifier).refresh();
    expect(state(container).items, hasLength(2));
    expect(state(container).isLoading, false);
    answer.complete(page(_leads(7, 1)));
    await refreshing;

    expect(state(container).items.single.id, 'lead-7');
  });

  test('a refresh that fails keeps the rows and throws', () async {
    final (:container, :api, :start) = await _setUp();
    api.on('GET', '/leads', (request) => page(_leads(1, 2)));
    start();
    await _settle();
    api.on('GET', '/leads', (request) => throw apiError(ApiError.network));

    await expectLater(
      container.read(leadsListProvider.notifier).refresh(),
      throwsA(isA<ApiError>()),
    );

    expect(state(container).items, hasLength(2));
    expect(state(container).error, isNull);
  });

  test('a new search starts the list again and drops the old answer', () async {
    final (:container, :api, :start) = await _setUp();
    final slow = Completer<Object?>();
    api.on('GET', '/leads', (request) {
      return request.query['search'] == 'north'
          ? page(_leads(9, 1))
          : slow.future;
    });
    start();
    await _settle();

    container.read(leadsQueryProvider.notifier).search('north');
    container
        .read(leadsQueryProvider.notifier)
        .filterByStatus(LeadStatus.qualified);
    await _settle();
    // The answer of the first, unfiltered request arrives last.
    slow.complete(page(_leads(1, 2)));
    await _settle();

    expect(state(container).items.single.id, 'lead-9');
    expect(api.requests.last.query, containsPair('status', 'QUALIFIED'));
    expect(api.requests.last.query, containsPair('search', 'north'));
  });

  test('a model that cannot read an answer is an error, not a crash', () async {
    final (:container, :api, :start) = await _setUp();
    api.on(
      'GET',
      '/leads',
      (request) => page([
        {'id': 'broken'},
      ]),
    );
    start();
    await _settle();

    expect(state(container).error?.code, ApiError.unexpected);
  });
}
