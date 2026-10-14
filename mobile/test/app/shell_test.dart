import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/navigation.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/features/more/more_screen.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump_app.dart';

FakeApi _api() {
  return FakeApi()
    ..on('GET', '/dashboard/me', (request) => dashboardJson())
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('POST', '/auth/logout', (request) => null);
}

void main() {
  group('the tabs', () {
    for (final user in [admin, manager, rep, readOnly]) {
      testWidgets(
        '${user.role.label}: Home, Leads, Tasks and More',
        variant: phones,
        (tester) async {
          final app = await pumpApp(tester, api: _api(), user: user);

          expect(find.byType(NavigationBar), findsOneWidget);
          expect(find.byType(NavigationDestination), findsNWidgets(4));
          expect(app.location, Routes.home);
          expect(find.textContaining(user.firstName), findsOneWidget);

          await tapVisible(
            tester,
            find.widgetWithText(NavigationDestination, 'Leads'),
          );
          expect(app.location, Routes.leads);
          expect(find.text('Marcus Chen'), findsOneWidget);
          // Only a role that may write is offered "New lead".
          expect(
            find.text('New lead'),
            user.role == Role.readOnly ? findsNothing : findsOneWidget,
          );

          await tapVisible(
            tester,
            find.widgetWithText(NavigationDestination, 'Tasks'),
          );
          expect(app.location, Routes.tasks);
          expect(find.text('No open tasks'), findsOneWidget);
          // Only a role that may write is offered "New task".
          expect(
            find.widgetWithText(FilledButton, 'New task'),
            user.role == Role.readOnly ? findsNothing : findsOneWidget,
          );

          await tapVisible(
            tester,
            find.widgetWithText(NavigationDestination, 'More'),
          );
          expect(app.location, Routes.more);
          expect(find.text(user.name), findsOneWidget);
          expect(find.text(user.email), findsOneWidget);
          expect(find.text(user.role.label), findsOneWidget);
        },
      );
    }

    testWidgets('a tablet gets a navigation rail and a capped content width', (
      tester,
    ) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        surface: tablet,
      );

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);

      await tapVisible(tester, find.text('Leads'));
      expect(app.location, Routes.leads);
      expect(
        tester.getSize(find.byType(Card).first).width,
        lessThanOrEqualTo(720),
      );
    });

    testWidgets('each tab keeps its page while another is shown', (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/leads/lead-1', (request) => leadJson())
        ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
      final app = await pumpApp(tester, api: api, user: rep);

      await tapVisible(
        tester,
        find.widgetWithText(NavigationDestination, 'Leads'),
      );
      await tapVisible(tester, find.text('Marcus Chen'));
      expect(app.location, Routes.lead('lead-1'));

      await tapVisible(
        tester,
        find.widgetWithText(NavigationDestination, 'Home'),
      );
      await tapVisible(
        tester,
        find.widgetWithText(NavigationDestination, 'Leads'),
      );
      expect(app.location, Routes.lead('lead-1'));

      // Tapping the tab that is shown goes back to its first page.
      await tapVisible(
        tester,
        find.widgetWithText(NavigationDestination, 'Leads'),
      );
      expect(app.location, Routes.leads);
    });

    test('every tab has a label, two icons and a path of its own', () {
      expect(appTabs.map((tab) => tab.label), [
        'Home',
        'Leads',
        'Tasks',
        'More',
      ]);
      expect(appTabs.map((tab) => tab.path).toSet(), hasLength(appTabs.length));
    });
  });

  group('More', () {
    testWidgets(
      'switches the theme and remembers the choice',
      variant: phones,
      (tester) async {
        final app = await pumpApp(
          tester,
          api: _api(),
          user: rep,
          location: Routes.more,
        );
        final startsDark = PhonesVariant.current!.dark;
        Color background() {
          return Theme.of(tester.element(find.byType(MoreScreen)))
              .scaffoldBackgroundColor;
        }

        // The phone's own setting, until a choice is made.
        expect(
          background(),
          startsDark ? AppColors.dark.background : AppColors.light.background,
        );
        // The More tab lists the pages of navigation.dart first: scroll down to the theme.
        await scrollTo(tester, find.text('System'));
        expect(find.text('System'), findsOneWidget);

        await tapVisible(tester, find.text('Theme'));
        await tapVisible(tester, find.text(startsDark ? 'Light' : 'Dark'));

        expect(
          background(),
          startsDark ? AppColors.light.background : AppColors.dark.background,
        );
        expect(app.store.values['theme_mode'], startsDark ? 'light' : 'dark');
      },
    );

    testWidgets(
      'signs out after asking, and ends the session on the server',
      variant: phones,
      (tester) async {
        final app = await pumpApp(
          tester,
          api: _api(),
          user: rep,
          location: Routes.more,
        );

        await tapVisible(tester, find.text('Sign out'));
        expect(find.text('Sign out?'), findsOneWidget);
        await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));
        expect(app.location, Routes.more);

        await tapVisible(tester, find.text('Sign out'));
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign out'));

        expect(app.location, Routes.signIn);
        expect(app.store.values.containsKey('session_token'), false);
        expect(app.api.sent('POST', '/auth/logout').single.token, testToken);
      },
    );

    testWidgets('changes the server: signs out and asks for the address', (
      tester,
    ) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: Routes.more,
      );

      expect(find.text(testServer), findsOneWidget);
      await tapVisible(tester, find.text('Server'));
      await tapVisible(tester, find.text('Sign out and change'));

      expect(app.location, Routes.server);
      expect(app.store.values, isNot(contains('server_url')));
    });

    testWidgets('shows the version of pubspec.yaml', (tester) async {
      await pumpApp(tester, api: _api(), user: rep, location: Routes.more);

      await scrollTo(tester, find.textContaining('OpenCRM $appVersion'));
      expect(find.textContaining('OpenCRM $appVersion'), findsOneWidget);
    });
  });

  group('the next person on the same phone', () {
    testWidgets('never sees the data of the one before', (tester) async {
      final api = _api()
        ..on('POST', '/auth/token', (request) {
          return {
            'user': userJson(readOnly),
            'token': 'robin-token',
            'expiresAt': 'x',
          };
        });
      final app = await pumpApp(tester, api: api, user: rep);
      await tapVisible(
        tester,
        find.widgetWithText(NavigationDestination, 'Leads'),
      );
      expect(find.text('Marcus Chen'), findsOneWidget);

      await app.container.read(authControllerProvider.notifier).signOut();
      await tester.pumpAndSettle();
      api
        ..on(
          'GET',
          '/leads',
          (request) =>
              page([leadJson(firstName: 'Elena', lastName: 'Rostova')]),
        )
        ..on('GET', '/dashboard/me', (request) => dashboardJson(openLeads: 0));
      await enterField(tester, 'Email', 'robin@example.com');
      await enterField(tester, 'Password', 'a-password');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign in'));
      await tapVisible(
        tester,
        find.widgetWithText(NavigationDestination, 'Leads'),
      );

      expect(find.text('Elena Rostova'), findsOneWidget);
      expect(find.text('Marcus Chen'), findsNothing);
      expect(api.sent('GET', '/leads').last.token, 'robin-token');
      expect(find.text('New lead'), findsNothing);
    });
  });
}
