import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/app_shell.dart';
import 'package:opencrm/app/navigation.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/features/auth/forgot_password_screen.dart';
import 'package:opencrm/features/auth/server_address_screen.dart';
import 'package:opencrm/features/auth/sign_in_screen.dart';
import 'package:opencrm/features/auth/starting_screen.dart';

/// Where someone in this state of sign-in has to be, or null when [location] is fine.
/// The one place that decides who sees which side of the sign-in.
String? redirectFor(AuthStatus status, String location) {
  switch (status) {
    case AuthStatus.starting:
    case AuthStatus.startFailed:
      return location == Routes.starting ? null : Routes.starting;
    case AuthStatus.needsServer:
      return location == Routes.server ? null : Routes.server;
    case AuthStatus.signedOut:
      // Signed out, the server address may still be changed, and a reset link asked for.
      const guestPages = [Routes.signIn, Routes.server, Routes.forgotPassword];
      return guestPages.contains(location) ? null : Routes.signIn;
    case AuthStatus.signedIn:
      const signedOutPages = [
        Routes.starting,
        Routes.server,
        Routes.signIn,
        Routes.forgotPassword,
      ];
      return signedOutPages.contains(location) ? Routes.home : null;
  }
}

/// The app's router: the pages before sign-in, then the tabs of `navigation.dart`
/// inside the shell. It runs [redirectFor] on every navigation and again whenever the
/// sign-in state changes, so signing out (or a session that ended) leads to the sign-in
/// screen from anywhere.
final routerProvider = Provider<GoRouter>((ref) {
  final authChanged = ValueNotifier(0);
  ref
    ..onDispose(authChanged.dispose)
    ..listen(
      authControllerProvider.select((auth) => auth.status),
      (_, _) => authChanged.value++,
    );

  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: Routes.home,
    refreshListenable: authChanged,
    redirect: (context, state) {
      return redirectFor(
        ref.read(authControllerProvider).status,
        state.matchedLocation,
      );
    },
    routes: [
      GoRoute(
        path: Routes.starting,
        builder: (context, state) => const StartingScreen(),
      ),
      GoRoute(
        path: Routes.server,
        builder: (context, state) => const ServerAddressScreen(),
      ),
      GoRoute(
        path: Routes.signIn,
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        // The sign-in screen hands over the email typed there, if any.
        builder: (context, state) => ForgotPasswordScreen(
          email: switch (state.extra) {
            final String email => email,
            _ => '',
          },
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          for (final tab in appTabs)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: tab.path,
                  builder: (context, state) => tab.builder(context),
                  routes: tab.routes,
                ),
              ],
            ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
