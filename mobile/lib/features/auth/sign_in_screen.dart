import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/auth/auth_layout.dart';

/// Email and password, against `POST /auth/token`. What the API refuses (a wrong
/// password, a locked or deactivated account, too many attempts) and a server that cannot
/// be reached are each said in words above the form.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;
  bool _showForgotHelp = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _saving = true);
    try {
      // On success the router moves on to Home.
      await ref
          .read(authControllerProvider.notifier)
          .signIn(email: _email.text.trim(), password: _password.text);
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: {'email', 'password'});
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final serverUrl = ref.watch(authControllerProvider).serverUrl ?? '';
    return AuthLayout(
      title: 'Sign in',
      description: 'Use the email and password of your OpenCRM account.',
      footer: Column(
        children: [
          MutedText('Server: $serverUrl', small: true),
          TextButton(
            onPressed: () => context.go(Routes.server),
            child: const Text('Change server'),
          ),
        ],
      ),
      child: Form(
        key: _formKey,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FormErrorBanner(_errors.form),
              AppTextField(
                label: 'Email',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                autofillHints: const [
                  AutofillHints.username,
                  AutofillHints.email,
                ],
                maxLength: 254,
                serverError: _errors['email'],
                onChanged: (_) =>
                    setState(() => _errors = _errors.without('email')),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ? 'Enter your email.' : null,
              ),
              PasswordField(
                label: 'Password',
                controller: _password,
                onSubmitted: (_) => _signIn(),
                validator: (value) =>
                    (value ?? '').isEmpty ? 'Enter your password.' : null,
              ),
              SubmitButton(
                label: 'Sign in',
                saving: _saving,
                onPressed: _signIn,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextButton(
                onPressed: () =>
                    setState(() => _showForgotHelp = !_showForgotHelp),
                child: const Text('Forgot password?'),
              ),
              if (_showForgotHelp)
                Semantics(
                  liveRegion: true,
                  child: MutedText(
                    'Passwords are reset in the web app. Open $serverUrl in a browser, choose '
                    '"Forgot password?" on its sign-in page, and follow the link in the email.',
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
