import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/app/router.dart';
import 'package:opencrm/core/theme/app_theme.dart';
import 'package:opencrm/core/theme/theme_controller.dart';

/// Riverpod 3 retries a provider that failed, on its own, with growing pauses. The app
/// does not want that: a screen that failed to load says so and offers Retry.
Duration? noRetry(int retryCount, Object error) => null;

/// The app: the light and dark themes, the theme the user chose, and the router.
class OpenCrmApp extends ConsumerWidget {
  const OpenCrmApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'OpenCRM',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeControllerProvider),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
