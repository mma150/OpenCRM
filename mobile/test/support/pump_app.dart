import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/app.dart';
import 'package:opencrm/app/router.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/storage/key_value_store.dart';
import 'package:opencrm/core/widgets/form_fields.dart';

import 'fake_api.dart';
import 'fixtures.dart';

const testServer = 'https://crm.example.test';
const testToken = 'test-session-token';

/// A phone the widget tests run on: its size in logical pixels, its theme and its text
/// size. An overflow on any of them fails the test, because Flutter reports an overflow as
/// an error.
class Surface {
  const Surface(this.name, this.size, {this.dark = false, this.textScale = 1});

  final String name;
  final Size size;
  final bool dark;
  final double textScale;

  @override
  String toString() => name;
}

/// A common phone in the light theme.
const phone = Surface('360x800 light', Size(360, 800));

/// The smallest phone the app supports, in the dark theme, with text at 130%.
const smallPhone = Surface(
  '320x640 dark, text 130%',
  Size(320, 640),
  dark: true,
  textScale: 1.3,
);

/// A tablet in portrait: the navigation rail, and content capped to a readable width.
const tablet = Surface('820x1180 light', Size(820, 1180));

/// Pass as `variant:` to run a widget test once on [phone] and once on [smallPhone]:
///
/// ```dart
/// testWidgets('shows the lead', variant: phones, (tester) async {
///   final app = await pumpApp(tester, api: api, user: rep);
/// });
/// ```
const phones = PhonesVariant();

/// Runs a test on each phone. [current] is the phone of the test that is running, and null
/// in a test without the variant (which then runs on [phone]).
class PhonesVariant extends TestVariant<Surface> {
  const PhonesVariant();

  static Surface? current;

  @override
  Iterable<Surface> get values => const [phone, smallPhone];

  @override
  String describeValue(Surface value) => value.name;

  @override
  Future<void> setUp(Surface value) async => current = value;

  @override
  Future<void> tearDown(Surface value, void memento) async => current = null;
}

/// What [pumpApp] hands back: the pieces a test asserts on.
class TestApp {
  const TestApp(this.api, this.store, this.container);

  final FakeApi api;
  final MemoryKeyValueStore store;
  final ProviderContainer container;

  GoRouter get router => container.read(routerProvider);

  /// The address the app is showing, such as `/leads/lead-1`.
  String get location => router.routerDelegate.currentConfiguration.uri.path;
}

/// Starts the whole app (router, shell, themes) against [api] and waits for it to settle.
///
/// - [user] signs that person in: the stored token is there and `GET /auth/me` answers
///   with them. Leave it out to start signed out.
/// - [server] false starts without a saved server address: the first launch.
/// - [location] opens a page directly, such as `/leads/lead-1`.
/// - [surface] defaults to the current value of the `phones` variant, or [phone].
///
/// At the end of the test it fails if the app made a request no handler answered.
Future<TestApp> pumpApp(
  WidgetTester tester, {
  required FakeApi api,
  User? user,
  bool server = true,
  String? location,
  Surface? surface,
  bool settle = true,
}) async {
  // A tap that lands on something else (a button under a bar) fails the test.
  WidgetController.hitTestWarningShouldBeFatal = true;
  final screen = surface ?? PhonesVariant.current ?? phone;
  tester.view
    ..physicalSize = screen.size
    ..devicePixelRatio = 1;
  tester.platformDispatcher
    ..textScaleFactorTestValue = screen.textScale
    ..platformBrightnessTestValue = screen.dark
        ? Brightness.dark
        : Brightness.light;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);

  final store = MemoryKeyValueStore({
    if (server) 'server_url': testServer,
    if (server && user != null) 'session_token': testToken,
  });
  if (user != null) {
    api.onDefault('GET', '/auth/me', (request) => userJson(user));
    // Home is the first page of a signed-in user, so its figures are always asked for.
    api.onDefault('GET', '/dashboard/me', (request) => dashboardJson());
    // Home shows the team's figures to those who manage one. Nobody else gets an answer,
    // so a request made for a Sales Rep or a Read-only user fails the test.
    if (user.role.seesTeam) {
      api.onDefault('GET', '/dashboard/team', (request) => teamDashboardJson());
    }
  }
  // The shell asks how many notifications are unread as soon as someone is signed in
  // (also someone who signs in during the test).
  api.onDefault('GET', '/notifications/unread-count', (request) {
    return {'count': 0};
  });
  // The Tasks tab and the Tasks card of a record page ask for tasks; none, unless a test
  // says so.
  api.onDefault('GET', '/tasks', (request) => page(const []));
  // A record page asks for the custom fields of its type; none, unless a test says so.
  api.onDefault('GET', '/custom-fields', (request) => const <Object?>[]);

  final container = ProviderContainer(
    retry: noRetry,
    overrides: [
      apiClientProvider.overrideWithValue(api),
      keyValueStoreProvider.overrideWithValue(store),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(() {
    expect(
      api.unhandled,
      isEmpty,
      reason: 'the app made requests the test has no handler for',
    );
  });

  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const OpenCrmApp()),
  );
  await tester.pumpAndSettle();
  final app = TestApp(api, store, container);
  if (location != null) {
    app.router.go(location);
    if (settle) {
      await tester.pumpAndSettle();
    }
  }
  return app;
}

/// Types into the form field with this label (the label the user sees above it).
Future<void> enterField(WidgetTester tester, String label, String text) async {
  await tester.enterText(field(label), text);
  await tester.pump();
}

/// The text field with this label.
Finder field(String label) {
  return find.descendant(
    of: find.widgetWithText(LabeledField, label),
    matching: find.byType(EditableText),
  );
}

/// The dropdown with this label.
Finder dropdown(String label) {
  return find.descendant(
    of: find.widgetWithText(LabeledField, label),
    matching: find.byWidgetPredicate(
      (widget) => widget is DropdownButtonFormField,
    ),
  );
}

/// Opens the dropdown with this label and picks [option].
Future<void> chooseOption(
  WidgetTester tester,
  String label,
  String option,
) async {
  await tapVisible(tester, dropdown(label));
  await tapVisible(tester, find.text(option).last);
}

/// Scrolls the page (down, then up) until the widget is built and on screen. A page builds only what
/// is near the screen, so on a small phone a test scrolls to what it checks, as a user
/// would.
Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  final page = find.byWidgetPredicate(
    (widget) =>
        widget is Scrollable && widget.axisDirection == AxisDirection.down,
  );
  try {
    await tester.scrollUntilVisible(finder, 200, scrollable: page.first);
  } on StateError {
    // Not below: the page was already scrolled past it.
    await tester.scrollUntilVisible(finder, -200, scrollable: page.first);
  }
  await tester.pumpAndSettle();
}

/// Scrolls until the widget is on screen, then taps it and waits for the app to settle.
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    await scrollTo(tester, finder);
  }
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}
