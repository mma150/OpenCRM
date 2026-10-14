import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/auth/auth_layout.dart';

/// What the app shows while it checks the saved session on launch. If the server cannot
/// be reached it stays here and offers Retry: the user is not signed out for being
/// offline. Signing out is still possible, to get to another account or server.
class StartingScreen extends ConsumerWidget {
  const StartingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final error = auth.startError;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.page),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Wordmark(),
                const SizedBox(height: AppSpacing.xl),
                if (auth.status == AuthStatus.startFailed && error != null) ...[
                  ErrorState(
                    error: error,
                    onRetry: ref.read(authControllerProvider.notifier).restore,
                  ),
                  TextButton(
                    onPressed: ref
                        .read(authControllerProvider.notifier)
                        .signOut,
                    child: const Text('Sign out'),
                  ),
                ] else
                  const CircularProgressIndicator(
                    semanticsLabel: 'Starting OpenCRM',
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
