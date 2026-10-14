import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

Map<String, Object?> _session() {
  return {
    'user': userJson(rep),
    'token': 'fresh-token',
    'expiresAt': '2026-11-15T09:30:00.000Z',
  };
}

/// Home and its dashboard, for the tests that end signed in.
FakeApi _apiWithHome() {
  return FakeApi()..on('GET', '/dashboard/me', (request) => dashboardJson());
}

Future<void> _signIn(
  WidgetTester tester, {
  String password = 'a-password',
}) async {
  await enterField(tester, 'Email', 'riley@example.com');
  await enterField(tester, 'Password', password);
  await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign in'));
}

void main() {
  group('server address', () {
    testWidgets('is the first screen of a new installation', variant: phones, (
      tester,
    ) async {
      final app = await pumpApp(tester, api: FakeApi(), server: false);

      expect(app.location, Routes.server);
      expect(find.text('Connect to your server'), findsOneWidget);
      expect(find.text('Back to sign in'), findsNothing);
      expect(app.api.requests, isEmpty);
    });

    testWidgets(
      'checks the address, saves it and goes to sign in',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/health', (request) => {'status': 'ok'});
        final app = await pumpApp(tester, api: api, server: false);

        await enterField(tester, 'Server address', 'crm.example.com/');
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Connect'));

        expect(app.location, Routes.signIn);
        expect(app.store.values['server_url'], 'https://crm.example.com');
        expect(find.text('Server: https://crm.example.com'), findsOneWidget);
      },
    );

    testWidgets('says what is wrong with an address before asking anyone', (
      tester,
    ) async {
      final app = await pumpApp(tester, api: FakeApi(), server: false);

      await tapVisible(tester, find.widgetWithText(FilledButton, 'Connect'));
      expect(
        find.text('Enter the address of your OpenCRM server.'),
        findsOneWidget,
      );

      await enterField(tester, 'Server address', 'ftp://crm.example.com');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Connect'));
      expect(
        find.text('Enter an address such as https://crm.example.com.'),
        findsOneWidget,
      );
      expect(app.api.requests, isEmpty);
      expect(app.location, Routes.server);
    });

    testWidgets(
      'says when nothing answers, and when it is not OpenCRM',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/health', (request) => throw apiError(ApiError.network));
        final app = await pumpApp(tester, api: api, server: false);

        await enterField(tester, 'Server address', 'https://crm.example.com');
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Connect'));
        expect(
          find.text(
            'No server answered at https://crm.example.com. '
            'Check the address and your connection.',
          ),
          findsOneWidget,
        );

        api.on(
          'GET',
          '/health',
          (request) => throw apiError(ApiError.invalidResponse),
        );
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Connect'));
        expect(
          find.textContaining('but it is not an OpenCRM server'),
          findsOneWidget,
        );
        expect(app.store.values.containsKey('server_url'), false);
        expect(app.location, Routes.server);
      },
    );

    testWidgets('can be changed from the sign-in screen, and left again', (
      tester,
    ) async {
      final app = await pumpApp(tester, api: FakeApi());
      expect(app.location, Routes.signIn);

      await tapVisible(tester, find.text('Change server'));
      expect(app.location, Routes.server);
      expect(find.text(testServer), findsOneWidget);

      await tapVisible(tester, find.text('Back to sign in'));
      expect(app.location, Routes.signIn);
    });
  });

  group('sign in', () {
    testWidgets('signs in, keeps the token and opens Home', variant: phones, (
      tester,
    ) async {
      final api = _apiWithHome()
        ..on('POST', '/auth/token', (request) => _session());
      final app = await pumpApp(tester, api: api);

      await _signIn(tester);

      expect(app.location, Routes.home);
      expect(find.textContaining('Riley'), findsOneWidget);
      expect(app.store.values['session_token'], 'fresh-token');
      expect(api.sent('POST', '/auth/token').single.json, {
        'email': 'riley@example.com',
        'password': 'a-password',
      });
      expect(api.sent('GET', '/dashboard/me').single.token, 'fresh-token');
    });

    testWidgets(
      'asks for both fields before sending anything',
      variant: phones,
      (tester) async {
        final app = await pumpApp(tester, api: FakeApi());

        await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign in'));

        expect(find.text('Enter your email.'), findsOneWidget);
        expect(find.text('Enter your password.'), findsOneWidget);
        expect(app.api.requests, isEmpty);
      },
    );

    final refusals = {
      apiError('INVALID_CREDENTIALS', status: 401):
          'Email or password is incorrect.',
      apiError(
        'ACCOUNT_LOCKED',
        status: 423,
        details: {'retryAfterSeconds': 600},
      ): 'This account is locked after too many wrong passwords. Try again in 10 minutes.',
      apiError('ACCOUNT_DEACTIVATED', status: 403):
          'This account has been deactivated. Ask an Admin to reactivate it.',
      apiError(
        'RATE_LIMITED',
        status: 429,
        details: {'retryAfterSeconds': 120},
      ): 'Too many attempts. Try again in 2 minutes.',
      apiError(ApiError.network):
          'The server cannot be reached. Check your connection and try again.',
      apiError(ApiError.timeout):
          'The server took too long to answer. Try again.',
      apiError('SERVICE_UNAVAILABLE', status: 503):
          'The service is temporarily unavailable. Try again in a moment.',
    };
    for (final MapEntry(key: error, value: message) in refusals.entries) {
      testWidgets('says "${error.code}" in words and stays', variant: phones, (
        tester,
      ) async {
        final api = FakeApi()
          ..on('POST', '/auth/token', (request) => throw error);
        final app = await pumpApp(tester, api: api);

        await _signIn(tester, password: 'wrong');

        expect(find.text(message), findsOneWidget);
        expect(app.location, Routes.signIn);
        expect(app.store.values.containsKey('session_token'), false);
        // The button works again.
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Sign in'),
              )
              .onPressed,
          isNotNull,
        );
      });
    }

    testWidgets('shows a validation message under its field', (tester) async {
      final api = FakeApi()
        ..on(
          'POST',
          '/auth/token',
          (request) => throw validationError({'email': 'Enter a valid email'}),
        );
      await pumpApp(tester, api: api);

      await _signIn(tester);

      expect(find.text('Enter a valid email'), findsOneWidget);
    });

    testWidgets('cannot be sent twice while it is on its way', (tester) async {
      final answer = Completer<Object?>();
      final api = _apiWithHome()
        ..on('POST', '/auth/token', (request) => answer.future);
      await pumpApp(tester, api: api);

      await enterField(tester, 'Email', 'riley@example.com');
      await enterField(tester, 'Password', 'a-password');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();

      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      answer.complete(_session());
      await tester.pumpAndSettle();
      expect(api.sent('POST', '/auth/token'), hasLength(1));
    });

    testWidgets(
      'hides the password until asked, and explains a forgotten one',
      (tester) async {
        await pumpApp(tester, api: FakeApi());

        expect(
          tester.widget<EditableText>(field('Password')).obscureText,
          true,
        );
        await tapVisible(tester, find.byTooltip('Show password'));
        expect(
          tester.widget<EditableText>(field('Password')).obscureText,
          false,
        );

        await tapVisible(tester, find.text('Forgot password?'));
        expect(
          find.textContaining('Passwords are reset in the web app'),
          findsOneWidget,
        );
      },
    );
  });

  group('on launch', () {
    testWidgets('a saved session opens Home without the sign-in screen', (
      tester,
    ) async {
      final app = await pumpApp(tester, api: _apiWithHome(), user: rep);

      expect(app.location, Routes.home);
      expect(app.api.sent('GET', '/auth/me').single.token, testToken);
    });

    testWidgets('a session that has ended opens the sign-in screen', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET', '/auth/me', (request) => throw apiError('UNAUTHENTICATED'));
      final app = await pumpApp(tester, api: api, user: rep);

      expect(app.location, Routes.signIn);
      expect(app.store.values.containsKey('session_token'), false);
    });

    testWidgets(
      'offline, it offers Retry and keeps the session',
      variant: phones,
      (tester) async {
        final api = _apiWithHome()
          ..on(
            'GET',
            '/auth/me',
            (request) => throw apiError(ApiError.network),
          );
        final app = await pumpApp(tester, api: api, user: rep);

        expect(app.location, Routes.starting);
        expect(
          find.text(
            'The server cannot be reached. Check your connection and try again.',
          ),
          findsOneWidget,
        );
        expect(app.store.values['session_token'], testToken);

        api.on('GET', '/auth/me', (request) => userJson(rep));
        await tapVisible(tester, find.text('Retry'));

        expect(app.location, Routes.home);
      },
    );
  });

  group('a session that ends while the app is open', () {
    testWidgets('leads to the sign-in screen from wherever the user is', (
      tester,
    ) async {
      final api = _apiWithHome()
        ..on('GET', '/leads', (request) => throw apiError('UNAUTHENTICATED'));
      final app = await pumpApp(tester, api: api, user: rep);
      expect(app.location, Routes.home);

      await tapVisible(tester, find.text('Leads'));

      expect(app.location, Routes.signIn);
      expect(app.store.values.containsKey('session_token'), false);
    });
  });
}
