# 0005: The mobile app: Riverpod, dio, go_router, secure storage, no code generation, and token sign-in

## Status

Accepted. The owner approved the five packages on 2026-10-13, when the mobile app was started; the rest follows from that approval and from the project's rule of simple, readable code.

Amended 2026-10-14: the owner approved a sixth package, `share_plus` (Flutter Community, BSD-3-Clause, pinned at 13.3.0), so that a quote's PDF can be handed to the phone's share sheet. It is used through one file, `core/share/file_sharer.dart`, and needs no `path_provider` of ours.

## Context

The web app and API v1 are finished. The Flutter app in `mobile/` is a second client of the same API, to be built feature by feature by several contributors at once. It needs one way to hold state, call the API, navigate and keep a session, chosen before the first feature so that every feature looks alike.

Two things were specific to a phone. A native app has no cookie jar, and the API's sign-in put the session token only in an httpOnly cookie. And OpenCRM is self-hosted, so the app cannot know its server's address when it is built.

## Decision

- **State: `flutter_riverpod`**, with plain `Notifier`, `AsyncNotifier` and `FutureProvider` written by hand. Riverpod's automatic retry is switched off: a screen that failed says so and offers Retry.
- **HTTP: `dio`**, behind one `ApiClient` class. Only `dio_api_client.dart` imports dio; everything else sees `ApiClient` and `ApiError`.
- **Navigation: `go_router`**, with one redirect function for the sign-in state and one file (`navigation.dart`) that lists the tabs and pages.
- **Session storage: `flutter_secure_storage`** (Keychain, Android Keystore), behind a `KeyValueStore` interface. It also keeps the server address and the theme choice, so no second storage package is needed.
- **Dates and money: `intl`**, with fixed en-US and USD as on the web.
- **No code generation.** No `freezed`, `json_serializable`, `build_runner` or `riverpod_generator`. Models are plain classes with a hand-written `fromJson`; providers are declared by hand.
- **Sign-in: a token route in the API.** `POST /auth/token` takes the email and password and answers `{ user, token, expiresAt }` without setting a cookie; the app sends the token as `Authorization: Bearer`. It is the same server-side session as the web's, with the same checks, rate limits, lockout and error codes as `POST /auth/login`.
- **The server address is asked for on first launch**, checked against the health route, and stored.
- **Versions are exact** (`pubspec.yaml` without `^`, `pubspec.lock` committed, Flutter pinned in `pubspec.yaml` and in CI), as in the two other apps.

The patterns are written down once, with copyable code, in the [mobile standard](../standards/mobile.md); the leads feature is the reference implementation.

## Consequences

- **More hand-written code per model and provider** than generated code would need, and a `fromJson` can drift from the API where the web's generated types cannot. The cost is paid with a test of each model against a JSON fixture and by keeping models small. In return there is no build step, no generated file to review or to forget, and `flutter test` runs from a clean checkout.
- **The API contract is not machine-checked on the mobile side.** A renamed field is found by the model tests and by running the app, not by a compiler. Generating Dart from `openapi.json` would close that gap and is the first thing to reconsider if drift becomes a real problem.
- **One session model for both clients.** The token is the web's session token: signing out, deactivating a user and resetting a password end a phone's session at once, and there is no refresh token to manage. A stolen phone token is as strong as a stolen cookie until it is ended; it is kept in the platform's secure storage and Android backups are off.
- **The token route answers a session token in a body**, which the cookie route deliberately never does. It sets no cookie, so it cannot sign a browser in, and the origin check still refuses it from another site.
- **Things the approved packages cannot do are left out**, not worked around: opening a link, dialling a number (`url_launcher`), the device's IANA time zone name (`flutter_timezone`; the app sends its UTC offset, which the API accepts). Each is listed in the [mobile standard](../standards/mobile.md#what-is-not-here-yet) for the owner to decide.
- **Riverpod 3 and go_router move quickly.** Major updates arrive as their own Dependabot pull requests and are a deliberate migration.
- It is costly to reverse: every feature's data layer and screens are written to these patterns.
