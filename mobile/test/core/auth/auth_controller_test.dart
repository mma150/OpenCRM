import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/app.dart';
import 'package:opencrm/app/navigation.dart';
import 'package:opencrm/app/router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/storage/key_value_store.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';

const _server = 'https://crm.example.test';

/// The auth controller on its own: a container, the fake API and storage in memory.
({ProviderContainer container, FakeApi api, MemoryKeyValueStore store}) _setUp({
  String? server = _server,
  String? token,
}) {
  final api = FakeApi();
  final store = MemoryKeyValueStore({
    'server_url': ?server,
    'session_token': ?token,
  });
  final container = ProviderContainer(
    retry: noRetry,
    overrides: [
      apiClientProvider.overrideWithValue(api),
      keyValueStoreProvider.overrideWithValue(store),
    ],
  );
  addTearDown(container.dispose);
  return (container: container, api: api, store: store);
}

/// Reads the controller (which starts restoring) and waits until it has left `starting`.
Future<AuthState> _started(ProviderContainer container) async {
  container.listen(authControllerProvider, (_, _) {});
  for (var turn = 0; turn < 20; turn += 1) {
    final state = container.read(authControllerProvider);
    if (state.status != AuthStatus.starting) {
      return state;
    }
    await Future<void>.delayed(Duration.zero);
  }
  return container.read(authControllerProvider);
}

void main() {
  group('on launch', () {
    test('asks for the server when none is saved', () async {
      final (:container, :api, store: _) = _setUp(server: null);

      expect((await _started(container)).status, AuthStatus.needsServer);
      expect(api.requests, isEmpty);
    });

    test(
      'is signed out with a server and no token, without asking the API',
      () async {
        final (:container, :api, store: _) = _setUp();

        final state = await _started(container);

        expect(state.status, AuthStatus.signedOut);
        expect(state.serverUrl, _server);
        expect(api.requests, isEmpty);
      },
    );

    test('restores the session: asks who the token belongs to', () async {
      final (:container, :api, store: _) = _setUp(token: 'saved-token');
      api.on('GET', '/auth/me', (request) => userJson(manager));

      final state = await _started(container);

      expect(state.status, AuthStatus.signedIn);
      expect(state.user?.name, 'Sarah Jenkins');
      expect(state.user?.role, Role.salesManager);
      expect(api.requests.single.token, 'saved-token');
      expect(container.read(currentUserProvider).id, manager.id);
    });

    test(
      'signs out and forgets the token when the session has ended',
      () async {
        final (:container, :api, :store) = _setUp(token: 'old-token');
        api.on(
          'GET',
          '/auth/me',
          (request) => throw apiError('UNAUTHENTICATED'),
        );

        final state = await _started(container);
        await Future<void>.delayed(Duration.zero);

        expect(state.status, AuthStatus.signedOut);
        expect(store.values.containsKey('session_token'), false);
        expect(api.token, isNull);
      },
    );

    test(
      'keeps the token and offers Retry when the server cannot be reached',
      () async {
        final (:container, :api, :store) = _setUp(token: 'saved-token');
        api.on(
          'GET',
          '/auth/me',
          (request) => throw apiError(ApiError.network),
        );

        final failed = await _started(container);

        expect(failed.status, AuthStatus.startFailed);
        expect(failed.startError?.code, ApiError.network);
        expect(store.values['session_token'], 'saved-token');

        api.on('GET', '/auth/me', (request) => userJson(rep));
        await container.read(authControllerProvider.notifier).restore();

        expect(
          container.read(authControllerProvider).status,
          AuthStatus.signedIn,
        );
      },
    );
  });

  group('the server address', () {
    test('is saved only after its health route answered', () async {
      final (:container, :api, :store) = _setUp(server: null);
      await _started(container);
      api.on('GET', '/health', (request) => {'status': 'ok'});

      await container
          .read(authControllerProvider.notifier)
          .saveServer('https://new.example.test');

      final state = container.read(authControllerProvider);
      expect(state.status, AuthStatus.signedOut);
      expect(state.serverUrl, 'https://new.example.test');
      expect(store.values['server_url'], 'https://new.example.test');
      expect(api.serverUrl, 'https://new.example.test');
    });

    test('is not saved when nothing answers there', () async {
      final (:container, :api, :store) = _setUp(server: null);
      await _started(container);
      api.on('GET', '/health', (request) => throw apiError(ApiError.network));

      await expectLater(
        container
            .read(authControllerProvider.notifier)
            .saveServer('https://x.test'),
        throwsA(isA<ApiError>()),
      );

      expect(
        container.read(authControllerProvider).status,
        AuthStatus.needsServer,
      );
      expect(store.values.containsKey('server_url'), false);
    });
  });

  group('signing in', () {
    test('keeps the token in storage and gives it to the API client', () async {
      final (:container, :api, :store) = _setUp();
      await _started(container);
      api.on(
        'POST',
        '/auth/token',
        (request) => {
          'user': userJson(rep),
          'token': 'fresh-token',
          'expiresAt': '2026-11-15T09:30:00.000Z',
        },
      );

      await container
          .read(authControllerProvider.notifier)
          .signIn(email: 'riley@example.com', password: 'a-password');

      final state = container.read(authControllerProvider);
      expect(state.status, AuthStatus.signedIn);
      expect(state.user?.email, 'riley@example.com');
      expect(store.values['session_token'], 'fresh-token');
      expect(api.token, 'fresh-token');
      expect(api.sent('POST', '/auth/token').single.json, {
        'email': 'riley@example.com',
        'password': 'a-password',
      });
    });

    test('throws what the API refused and stays signed out', () async {
      final (:container, :api, :store) = _setUp();
      await _started(container);
      api.on(
        'POST',
        '/auth/token',
        (request) => throw apiError('INVALID_CREDENTIALS', status: 401),
      );

      await expectLater(
        container
            .read(authControllerProvider.notifier)
            .signIn(email: 'riley@example.com', password: 'wrong'),
        throwsA(
          isA<ApiError>().having((e) => e.code, 'code', 'INVALID_CREDENTIALS'),
        ),
      );

      expect(
        container.read(authControllerProvider).status,
        AuthStatus.signedOut,
      );
      expect(store.values.containsKey('session_token'), false);
    });
  });

  group('signing out', () {
    test(
      'forgets the token, then ends the session on the server with it',
      () async {
        final (:container, :api, :store) = _setUp(token: 'saved-token');
        api
          ..on('GET', '/auth/me', (request) => userJson(rep))
          ..on('POST', '/auth/logout', (request) => null);
        await _started(container);

        await container.read(authControllerProvider.notifier).signOut();

        expect(
          container.read(authControllerProvider).status,
          AuthStatus.signedOut,
        );
        expect(container.read(authControllerProvider).serverUrl, _server);
        expect(store.values.containsKey('session_token'), false);
        expect(api.token, isNull);
        expect(api.sent('POST', '/auth/logout').single.token, 'saved-token');
      },
    );

    test('works without a connection', () async {
      final (:container, :api, :store) = _setUp(token: 'saved-token');
      api
        ..on('GET', '/auth/me', (request) => userJson(rep))
        ..on(
          'POST',
          '/auth/logout',
          (request) => throw apiError(ApiError.network),
        );
      await _started(container);

      await container.read(authControllerProvider.notifier).signOut();

      expect(
        container.read(authControllerProvider).status,
        AuthStatus.signedOut,
      );
      expect(store.values.containsKey('session_token'), false);
    });

    test(
      'happens on its own when any request says the session has ended',
      () async {
        final (:container, :api, :store) = _setUp(token: 'saved-token');
        api
          ..on('GET', '/auth/me', (request) => userJson(rep))
          ..on('GET', '/leads', (request) => throw apiError('UNAUTHENTICATED'));
        await _started(container);

        await expectLater(api.get('/leads'), throwsA(isA<ApiError>()));
        await Future<void>.delayed(Duration.zero);

        expect(
          container.read(authControllerProvider).status,
          AuthStatus.signedOut,
        );
        expect(store.values.containsKey('session_token'), false);
        expect(container.read(sessionUserIdProvider), isNull);
      },
    );

    test('changing the server signs out and forgets the address too', () async {
      final (:container, :api, :store) = _setUp(token: 'saved-token');
      api
        ..on('GET', '/auth/me', (request) => userJson(rep))
        ..on('POST', '/auth/logout', (request) => null);
      await _started(container);

      await container.read(authControllerProvider.notifier).changeServer();

      expect(
        container.read(authControllerProvider).status,
        AuthStatus.needsServer,
      );
      expect(store.values, isEmpty);
      expect(api.serverUrl, isNull);
    });
  });

  group('roles', () {
    test('follow the same access rules as the web app and the API', () {
      expect(Role.admin.canWriteRecords, true);
      expect(Role.salesManager.canWriteRecords, true);
      expect(Role.salesRep.canWriteRecords, true);
      expect(Role.readOnly.canWriteRecords, false);

      expect(Role.admin.canReassignRecords, true);
      expect(Role.salesManager.canReassignRecords, true);
      expect(Role.salesRep.canReassignRecords, false);
      expect(Role.readOnly.canReassignRecords, false);

      expect(Role.admin.seesTeam, true);
      expect(Role.salesManager.seesTeam, true);
      expect(Role.salesRep.seesTeam, false);
      expect(Role.readOnly.seesTeam, false);
    });

    test('a role this version does not know gets the least access', () {
      expect(Role.fromApi('SOMETHING_NEW'), Role.readOnly);
      expect(Role.fromApi('SALES_MANAGER'), Role.salesManager);
    });
  });

  group('redirectFor', () {
    test('keeps everyone on the right side of the sign-in', () {
      expect(redirectFor(AuthStatus.starting, Routes.home), Routes.starting);
      expect(
        redirectFor(AuthStatus.startFailed, Routes.leads),
        Routes.starting,
      );
      expect(redirectFor(AuthStatus.needsServer, Routes.signIn), Routes.server);
      expect(redirectFor(AuthStatus.needsServer, Routes.server), isNull);
      expect(
        redirectFor(AuthStatus.signedOut, Routes.lead('x')),
        Routes.signIn,
      );
      expect(redirectFor(AuthStatus.signedOut, Routes.signIn), isNull);
      expect(redirectFor(AuthStatus.signedOut, Routes.server), isNull);
      expect(redirectFor(AuthStatus.signedIn, Routes.signIn), Routes.home);
      expect(redirectFor(AuthStatus.signedIn, Routes.starting), Routes.home);
      expect(redirectFor(AuthStatus.signedIn, Routes.lead('x')), isNull);
    });
  });

  group('moreItemsFor', () {
    test('hides a row from the roles it is not for', () {
      final items = [
        const MoreItem(
          label: 'Contacts',
          icon: Icons.contacts_outlined,
          path: '/more/contacts',
        ),
        MoreItem(
          label: 'Activity',
          icon: Icons.history,
          path: '/more/activity',
          visibleTo: (role) => role.seesTeam,
        ),
      ];

      List<String> labels(Role role) {
        return [for (final item in moreItemsFor(role, items)) item.label];
      }

      expect(labels(Role.admin), ['Contacts', 'Activity']);
      expect(labels(Role.salesManager), ['Contacts', 'Activity']);
      expect(labels(Role.salesRep), ['Contacts']);
      expect(labels(Role.readOnly), ['Contacts']);
    });
  });
}
