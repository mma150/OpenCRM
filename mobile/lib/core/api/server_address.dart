import 'package:flutter/foundation.dart';

/// OpenCRM is self-hosted, so the user types where their server is. This turns what they
/// typed into the address the app stores, or says what is wrong with it.
///
/// - `crm.example.com` becomes `https://crm.example.com`.
/// - A trailing `/` and a trailing `/api/v1` are dropped; the app adds `/api/v1` itself.
/// - Plain `http://` is accepted only when [allowHttp] is true. That is every build except
///   a release build: Android and iOS refuse cleartext traffic in release builds anyway
///   (see docs/standards/mobile.md, "Running against a local server").
class ServerAddress {
  const ServerAddress._(this.url, this.error);

  /// The normalised address, or null when [error] is set.
  final String? url;
  final String? error;

  static ServerAddress parse(String input, {bool allowHttp = !kReleaseMode}) {
    var text = input.trim();
    if (text.isEmpty) {
      return const ServerAddress._(
        null,
        'Enter the address of your OpenCRM server.',
      );
    }
    if (!text.contains('://')) {
      text = 'https://$text';
    }
    final uri = Uri.tryParse(text);
    if (uri == null ||
        uri.host.isEmpty ||
        !(uri.isScheme('https') || uri.isScheme('http'))) {
      return const ServerAddress._(
        null,
        'Enter an address such as https://crm.example.com.',
      );
    }
    if (uri.isScheme('http') && !allowHttp) {
      return const ServerAddress._(
        null,
        'Use an https:// address. This app does not use http.',
      );
    }
    if (uri.hasQuery || uri.hasFragment || uri.userInfo.isNotEmpty) {
      return const ServerAddress._(
        null,
        'Enter only the address, such as https://crm.example.com.',
      );
    }

    var path = uri.path;
    while (path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }
    if (path.endsWith('/api/v1')) {
      path = path.substring(0, path.length - '/api/v1'.length);
    }
    final port = uri.hasPort ? ':${uri.port}' : '';
    // Uri lower-cases the scheme and the host.
    return ServerAddress._('${uri.scheme}://${uri.host}$port$path', null);
  }
}
