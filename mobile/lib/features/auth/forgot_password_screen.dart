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

/// "Forgot password?" from the sign-in screen: the email, then `POST
/// /auth/forgot-password`. The server emails a link to the web app's reset page (it builds
/// the link from its own address), so the phone needs no browser and the person can open
/// the link on any device. The answer is the same whether or not the email has an account,
/// and so is what this screen says.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.email = ''});

  /// What was typed on the sign-in screen, to start with.
  final String email;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.email.trim());
  ServerErrors _errors = ServerErrors.none;
  bool _sending = false;
  bool _sent = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  String? _validEmail(String? value) {
    final email = (value ?? '').trim();
    if (email.isEmpty) {
      return 'Enter your email.';
    }
    // The server has the real rule; this catches a slip of the thumb.
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)
        ? null
        : 'Enter a valid email address.';
  }

  Future<void> _send() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _sending = true);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .requestPasswordReset(_email.text.trim());
      if (mounted) {
        setState(() {
          _sent = true;
          _sending = false;
        });
      }
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: {'email'});
          _sending = false;
        });
      }
    }
  }

  void _backToSignIn() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.signIn);
    }
  }

  @override
  Widget build(BuildContext context) {
    final footer = TextButton(
      onPressed: _backToSignIn,
      child: const Text('Back to sign in'),
    );
    if (_sent) {
      // The same answer whether or not the email has an account.
      return AuthLayout(
        title: 'Check your email',
        description: _email.text.trim(),
        footer: footer,
        child: Semantics(
          liveRegion: true,
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'If that email exists, we sent a link. It is valid for 1 hour.',
              ),
              SizedBox(height: AppSpacing.md),
              MutedText(
                'Open the link on any device to set a new password, then sign in '
                'here with it.',
              ),
            ],
          ),
        ),
      );
    }
    return AuthLayout(
      title: 'Reset your password',
      description:
          'Enter your email and we will send you a link to set a new password.',
      footer: footer,
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FormErrorBanner(_errors.form),
            AppTextField(
              label: 'Email',
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.send,
              autocorrect: false,
              autofillHints: const [
                AutofillHints.username,
                AutofillHints.email,
              ],
              maxLength: 254,
              serverError: _errors['email'],
              onChanged: (_) {
                if (_errors['email'] != null) {
                  setState(() => _errors = _errors.without('email'));
                }
              },
              onSubmitted: (_) => _send(),
              validator: _validEmail,
            ),
            SubmitButton(
              label: 'Send reset link',
              saving: _sending,
              onPressed: _send,
            ),
          ],
        ),
      ),
    );
  }
}
