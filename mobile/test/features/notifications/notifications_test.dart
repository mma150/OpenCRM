import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/features/notifications/notification.dart';
import 'package:opencrm/features/notifications/notification_bell.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

List<Object?> _notifications(int from, int count) {
  return [
    for (var index = from; index < from + count; index += 1)
      notificationJson(
        id: 'notification-$index',
        title: 'Notification number $index',
        readAt: '2026-10-05T10:00:00.000Z',
      ),
  ];
}

void main() {
  group('the bell', () {
    testWidgets(
      'shows the unread count on the first page of each tab',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/notifications/unread-count', (request) => {'count': 3})
          ..on('GET', '/leads', (request) => page([leadJson()]))
          ..on('GET', '/leads/lead-1', (request) => leadJson())
          ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
        final app = await pumpApp(tester, api: api, user: rep);

        expect(find.byTooltip('Notifications, 3 unread'), findsOneWidget);
        expect(find.text('3'), findsWidgets);
        for (final tab in ['Leads', 'Tasks', 'More']) {
          await tapVisible(
            tester,
            find.widgetWithText(NavigationDestination, tab),
          );
          expect(find.byTooltip('Notifications, 3 unread'), findsOneWidget);
        }

        // A page under a tab has its own actions, without the bell.
        app.router.go(Routes.lead('lead-1'));
        await tester.pumpAndSettle();
        expect(find.byTooltip('Notifications, 3 unread'), findsNothing);
      },
    );

    testWidgets('is asked at once, every minute, and not in the background', (
      tester,
    ) async {
      addTearDown(() {
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
      });
      var count = 1;
      final api = FakeApi()
        ..on(
          'GET',
          '/notifications/unread-count',
          (request) => {'count': count},
        );
      await pumpApp(tester, api: api, user: rep);
      List<FakeRequest> asked() =>
          api.sent('GET', '/notifications/unread-count');

      expect(asked(), hasLength(1));
      expect(find.byTooltip('Notifications, 1 unread'), findsOneWidget);

      count = 2;
      await tester.pump(UnreadCountPoller.interval);
      await tester.pump();
      expect(asked(), hasLength(2));
      expect(find.byTooltip('Notifications, 2 unread'), findsOneWidget);

      // In the background nothing is asked.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(minutes: 5));
      expect(asked(), hasLength(2));

      // Back in the foreground: asked at once, and every minute again.
      count = 5;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      await tester.pump();
      expect(asked(), hasLength(3));
      expect(find.byTooltip('Notifications, 5 unread'), findsOneWidget);
      await tester.pump(UnreadCountPoller.interval);
      expect(asked(), hasLength(4));
    });

    testWidgets('stops asking when the user signs out', (tester) async {
      final api = FakeApi()..on('POST', '/auth/logout', (request) => null);
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.more,
      );

      await tapVisible(tester, find.text('Sign out'));
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Sign out'));
      expect(app.location, Routes.signIn);
      final before = api.sent('GET', '/notifications/unread-count').length;
      await tester.pump(const Duration(minutes: 3));
      expect(api.sent('GET', '/notifications/unread-count'), hasLength(before));
    });

    testWidgets('a failed ask keeps the number and says nothing', (
      tester,
    ) async {
      var fail = false;
      final api = FakeApi()
        ..on('GET', '/notifications/unread-count', (request) {
          if (fail) {
            throw apiError('NETWORK_ERROR');
          }
          return {'count': 4};
        });
      await pumpApp(tester, api: api, user: rep);
      fail = true;
      await tester.pump(UnreadCountPoller.interval);
      await tester.pump();
      expect(find.byTooltip('Notifications, 4 unread'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
    });
  });

  group('the notifications page', () {
    testWidgets(
      'newest first, the unread ones marked in words',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/notifications/unread-count', (request) => {'count': 1})
          ..on('GET', '/notifications', (request) {
            return page([
              notificationJson(),
              notificationJson(
                id: 'notification-2',
                kind: 'LEAD_FOLLOW_UP',
                title: 'Follow up with Marcus Chen',
                body: null,
                link: '/leads/lead-1',
                readAt: '2026-10-05T10:00:00.000Z',
              ),
            ]);
          });
        final app = await pumpApp(tester, api: api, user: rep);

        await tapVisible(tester, find.byTooltip('Notifications, 1 unread'));
        expect(app.location, Routes.notifications);
        expect(find.text('Reminder: Send revised pricing'), findsOneWidget);
        expect(find.text('New'), findsOneWidget);
        expect(find.textContaining('Task reminder · '), findsOneWidget);
        expect(find.text('Follow up with Marcus Chen'), findsOneWidget);
        expect(find.textContaining('Lead follow-up · '), findsOneWidget);
        expect(find.text('1 unread'), findsOneWidget);
      },
    );

    testWidgets(
      'a tap marks it read and opens the task it is about',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/notifications/unread-count', (request) => {'count': 1})
          ..on('GET', '/notifications', (request) => page([notificationJson()]))
          ..on('POST', '/notifications/notification-1/read', (request) {
            return notificationJson(readAt: '2026-10-05T10:00:00.000Z');
          })
          ..on('GET', '/tasks/task-1', (request) => taskJson())
          ..on('GET', '/users/assignable', (request) => const <Object?>[]);
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.notifications,
        );

        await tapVisible(tester, find.text('Reminder: Send revised pricing'));
        expect(
          api.sent('POST', '/notifications/notification-1/read'),
          hasLength(1),
        );
        expect(app.location, Routes.tasks);
        expect(find.text('Edit task'), findsOneWidget);
        expect(find.text('Send revised pricing'), findsWidgets);
      },
    );

    testWidgets('a lead\'s follow-up opens the lead', (tester) async {
      final api = FakeApi()
        ..on('GET', '/notifications', (request) {
          return page([
            notificationJson(
              kind: 'LEAD_FOLLOW_UP',
              title: 'Follow up with Marcus Chen',
              link: '/leads/lead-1',
            ),
          ]);
        })
        ..on('POST', '/notifications/notification-1/read', (request) {
          return notificationJson(readAt: '2026-10-05T10:00:00.000Z');
        })
        ..on('GET', '/leads', (request) => page([leadJson()]))
        ..on('GET', '/leads/lead-1', (request) => leadJson())
        ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.notifications,
      );

      await tapVisible(tester, find.text('Follow up with Marcus Chen'));
      expect(app.location, Routes.lead('lead-1'));
    });

    testWidgets('a link the app has no page for is said, not followed', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET', '/notifications', (request) {
          return page([
            notificationJson(
              title: 'Invoice overdue',
              link: '/invoices/inv-1',
              readAt: '2026-10-05T10:00:00.000Z',
            ),
          ]);
        });
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.notifications,
      );

      await tapVisible(tester, find.text('Invoice overdue'));
      expect(app.location, Routes.notifications);
      expect(
        find.textContaining(
          'The app cannot open what this notification is about',
        ),
        findsOneWidget,
      );
      // It was already read: nothing to send.
      expect(api.sent('POST', RegExp(r'/notifications/.*/read')), isEmpty);
    });

    testWidgets('marks all as read', variant: phones, (tester) async {
      final api = FakeApi()
        ..on('GET', '/notifications/unread-count', (request) => {'count': 1})
        ..on('GET', '/notifications', (request) => page([notificationJson()]))
        ..on('POST', '/notifications/read-all', (request) => {'marked': 1});
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.notifications,
      );

      await tapVisible(tester, find.text('Mark all as read'));
      expect(api.sent('POST', '/notifications/read-all'), hasLength(1));
      expect(
        find.text('All notifications are marked as read.'),
        findsOneWidget,
      );
      expect(find.text('New'), findsNothing);
      expect(find.text('You have read everything.'), findsOneWidget);
    });

    testWidgets('loads the next page as the end comes near', (tester) async {
      final api = FakeApi()
        ..on('GET', '/notifications', (request) {
          final number = int.parse(request.query['page']!);
          return page(
            _notifications((number - 1) * 25 + 1, number == 1 ? 25 : 5),
            total: 30,
            page: number,
          );
        });
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.notifications,
      );

      await scrollTo(tester, find.text('Notification number 30'));
      expect(api.sent('GET', '/notifications').map((r) => r.query['page']), [
        '1',
        '2',
      ]);
    });

    testWidgets(
      'says so when there are none, and a failure offers Retry',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on(
            'GET',
            '/notifications',
            (request) => throw apiError('SERVICE_UNAVAILABLE'),
          );
        await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.notifications,
        );
        expect(
          find.text(
            'The service is temporarily unavailable. Try again in a moment.',
          ),
          findsOneWidget,
        );

        api.on('GET', '/notifications', (request) => page([]));
        await tapVisible(tester, find.text('Retry'));
        expect(find.text('No notifications yet'), findsOneWidget);
      },
    );
  });

  test('an unknown kind is still shown, as a plain notification', () {
    final notification = AppNotification.fromJson(
      notificationJson(kind: 'QUOTE_ACCEPTED'),
    );
    expect(notification.kind, NotificationKind.unknown);
    expect(notification.kind.label, 'Notification');
    expect(notification.isUnread, isTrue);
    final read = notification.read(DateTime(2026, 10, 6));
    expect(read.isUnread, isFalse);
  });
}
