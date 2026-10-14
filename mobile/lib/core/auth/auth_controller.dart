import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/storage/key_value_store.dart';

/// Where the app is between launch and a signed-in user.
enum AuthStatus {
  /// Reading what was saved and asking the server who the token belongs to.
  starting,

  /// The saved session could not be checked (no network, server down). The user may retry;
  /// the token is kept.
  startFailed,

  /// No server address yet: the first launch.
  needsServer,

  signedOut,
  signedIn,
}

class AuthState {
  const AuthState({
    required this.status,
    this.serverUrl,
    this.user,
    this.startError,
  });

  final AuthStatus status;

  /// The server the user chose, such as `https://crm.example.com`.
  final String? serverUrl;

  /// Set exactly when [status] is [AuthStatus.signedIn].
  final User? user;

  /// Why the saved session could not be checked ([AuthStatus.startFailed]).
  final ApiError? startError;
}

const _serverUrlKey = 'server_url';
const _tokenKey = 'session_token';

/// Owns the session: the server address, the token and the signed-in user. It is also the
/// one that gives the [ApiClient] its server address and token, and the one the client
/// tells when the session has ended.
///
/// The token is kept in the device's secure storage and nowhere else.
class AuthController extends Notifier<AuthState> {
  late ApiClient _api;
  late KeyValueStore _store;

  @override
  AuthState build() {
    _api = ref.watch(apiClientProvider);
    _store = ref.watch(keyValueStoreProvider);
    _api.onUnauthenticated = _sessionEnded;
    // Runs after build has returned, so it may set the state.
    Future.microtask(restore);
    return const AuthState(status: AuthStatus.starting);
  }

  /// On launch, and again from the Retry button: read the saved server address and token,
  /// then ask the server who is signed in.
  Future<void> restore() async {
    final serverUrl = await _store.read(_serverUrlKey);
    final token = await _store.read(_tokenKey);
    _api
      ..serverUrl = serverUrl
      ..token = token;

    if (serverUrl == null) {
      state = const AuthState(status: AuthStatus.needsServer);
      return;
    }
    if (token == null) {
      state = AuthState(status: AuthStatus.signedOut, serverUrl: serverUrl);
      return;
    }
    state = AuthState(status: AuthStatus.starting, serverUrl: serverUrl);
    try {
      final response = await _api.get('/auth/me');
      state = AuthState(
        status: AuthStatus.signedIn,
        serverUrl: serverUrl,
        user: User.fromJson(asMap(response.data)),
      );
    } on ApiError catch (error) {
      // An ended session was already handled by _sessionEnded. Anything else (no network,
      // the server is down) keeps the token and offers Retry.
      if (error.code != ApiError.unauthenticated) {
        state = AuthState(
          status: AuthStatus.startFailed,
          serverUrl: serverUrl,
          startError: error,
        );
      }
    }
  }

  /// Checks that [serverUrl] is an OpenCRM server (its health route answers) and saves it.
  /// Changing the address ends the session: a token belongs to one server.
  Future<void> saveServer(String serverUrl) async {
    await _api.send('GET', '/health', serverUrl: serverUrl);
    await _store.write(_serverUrlKey, serverUrl);
    await _store.delete(_tokenKey);
    _api
      ..serverUrl = serverUrl
      ..token = null;
    state = AuthState(status: AuthStatus.signedOut, serverUrl: serverUrl);
  }

  /// Signs in with `POST /auth/token` and keeps the token. Throws the [ApiError] so the
  /// form can show it.
  Future<void> signIn({required String email, required String password}) async {
    final response = await _api.post(
      '/auth/token',
      body: {'email': email, 'password': password},
    );
    final data = asMap(response.data);
    final token = readString(data, 'token');
    final user = User.fromJson(asMap(data['user']));
    await _store.write(_tokenKey, token);
    _api.token = token;
    state = AuthState(
      status: AuthStatus.signedIn,
      serverUrl: state.serverUrl,
      user: user,
    );
  }

  /// Asks the server to email a link that sets a new password (`POST
  /// /auth/forgot-password`). The server answers the same whether or not the email has an
  /// account, so nothing here says which. The link opens the web app's reset page.
  Future<void> requestPasswordReset(String email) async {
    await _api.post('/auth/forgot-password', body: {'email': email});
  }

  /// Signs out on this device at once, then tells the server to end the session. A server
  /// that cannot be reached does not keep the user signed in here.
  Future<void> signOut() async {
    final token = _api.token;
    await _forgetToken();
    state = AuthState(status: AuthStatus.signedOut, serverUrl: state.serverUrl);
    if (token != null) {
      try {
        await _api.send('POST', '/auth/logout', token: token);
      } on ApiError {
        // The session ends on its own after 30 days without use.
      }
    }
  }

  /// Signs out and forgets the server address, so the app asks for one again.
  Future<void> changeServer() async {
    await signOut();
    await _store.delete(_serverUrlKey);
    _api.serverUrl = null;
    state = const AuthState(status: AuthStatus.needsServer);
  }

  /// The API said the session has ended (expired, signed out elsewhere, user deactivated).
  void _sessionEnded() {
    if (state.status == AuthStatus.signedOut ||
        state.status == AuthStatus.needsServer) {
      return;
    }
    _api.token = null;
    state = AuthState(status: AuthStatus.signedOut, serverUrl: state.serverUrl);
    // Storage is slower than the screen; the token is already out of use.
    _store.delete(_tokenKey).ignore();
  }

  Future<void> _forgetToken() async {
    _api.token = null;
    await _store.delete(_tokenKey);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

/// Whose data the app is showing: the id of the signed-in user, or null.
///
/// **Every provider that holds data read from the server watches this** (`PagedNotifier`
/// does it for every list), so signing out, or someone else signing in on the same phone,
/// throws that data away instead of showing it to the next person.
final sessionUserIdProvider = Provider<String?>((ref) {
  return ref.watch(authControllerProvider.select((auth) => auth.user?.id));
});

/// Who nobody is: what [currentUserProvider] answers for the one frame between signing out
/// and the router showing the sign-in screen. Read-only, so nothing is offered.
const _nobody = User(id: '', name: '', email: '', role: Role.readOnly);

/// The signed-in user, for the screens behind the sign-in.
final currentUserProvider = Provider<User>((ref) {
  return ref.watch(authControllerProvider.select((auth) => auth.user)) ??
      _nobody;
});
