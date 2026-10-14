import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/api/server_address.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/features/auth/auth_layout.dart';

/// Where is your OpenCRM server? The first screen of a new installation, and where the
/// sign-in screen's "Change server" leads. The address is saved only after the server
/// answered its health check.
class ServerAddressScreen extends ConsumerStatefulWidget {
  const ServerAddressScreen({super.key});

  @override
  ConsumerState<ServerAddressScreen> createState() =>
      _ServerAddressScreenState();
}

class _ServerAddressScreenState extends ConsumerState<ServerAddressScreen> {
  late final _address = TextEditingController(
    text: ref.read(authControllerProvider).serverUrl ?? '',
  );
  String? _fieldError;
  String? _formError;
  bool _checking = false;

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final parsed = ServerAddress.parse(_address.text);
    setState(() {
      _fieldError = parsed.error;
      _formError = null;
    });
    final url = parsed.url;
    if (url == null) {
      return;
    }
    setState(() => _checking = true);
    try {
      await ref.read(authControllerProvider.notifier).saveServer(url);
      if (mounted) {
        context.go(Routes.signIn);
      }
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _formError = _describe(error, url);
          _checking = false;
        });
      }
    }
  }

  String _describe(ApiError error, String url) {
    switch (error.code) {
      case ApiError.network:
        return 'No server answered at $url. Check the address and your connection.';
      case ApiError.invalidResponse:
      case 'NOT_FOUND':
        return 'Something answered at $url, but it is not an OpenCRM server. Check the address.';
      case 'SERVICE_UNAVAILABLE':
        return 'The server at $url is running, but its database is not available. '
            'Try again in a moment.';
      default:
        return describeApiError(error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasServer = ref.watch(authControllerProvider).serverUrl != null;
    return AuthLayout(
      title: 'Connect to your server',
      description:
          'OpenCRM is self-hosted. Enter the address of your organisation\'s OpenCRM, '
          'the one you open in a browser.',
      footer: hasServer
          ? TextButton(
              onPressed: () => context.go(Routes.signIn),
              child: const Text('Back to sign in'),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FormErrorBanner(_formError),
          AppTextField(
            label: 'Server address',
            controller: _address,
            hint: 'https://crm.example.com',
            keyboardType: TextInputType.url,
            textInputAction: TextInputAction.go,
            autocorrect: false,
            autofillHints: const [AutofillHints.url],
            serverError: _fieldError,
            onChanged: (_) => setState(() => _fieldError = null),
            onSubmitted: (_) => _connect(),
          ),
          if (!kReleaseMode)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text(
                'Debug build: http:// is allowed. The Android emulator reaches this computer '
                'at http://10.0.2.2:4100.',
              ),
            ),
          SubmitButton(
            label: 'Connect',
            saving: _checking,
            onPressed: _connect,
          ),
        ],
      ),
    );
  }
}
