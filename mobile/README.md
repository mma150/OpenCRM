# OpenCRM mobile

The OpenCRM app for phones and tablets, written in Flutter for Android and iOS. It is a second client of the same versioned API as the web app, described by [`backend/openapi/openapi.json`](../backend/openapi/openapi.json).

Today it has: connecting to your own server, sign-in, Home (your numbers, tasks and follow-ups that are due), and leads with their timeline (search, filter, create, edit, change status, mark as lost, reassign, follow-up, log a conversation, add a note). The other features follow; see [what is not here yet](../docs/standards/mobile.md#what-is-not-here-yet).

How the app is built, and how to add a feature, is in the [mobile standard](../docs/standards/mobile.md). Why these packages: [decision 0005](../docs/decisions/0005-mobile-app-stack.md).

## Run it

You need [Flutter](https://docs.flutter.dev/get-started/install) 3.47.6 (the version in `pubspec.yaml` and in CI) and a device: an Android emulator, an iOS simulator (on a Mac) or a phone.

1. Start the API: `docker compose up` in the repository root ([README](../README.md)).
2. From this folder:

   ```sh
   flutter pub get
   flutter run
   ```

3. On the first screen enter the server address:

   | Running on | Server address |
   | --- | --- |
   | Android emulator | `http://10.0.2.2:4000` |
   | iOS simulator | `http://localhost:4000` |
   | A phone on the same network | `http://<your computer's address>:4000` |

   Use your `API_PORT` if you changed it. The app adds `/api/v1` itself.

4. Sign in with an account of that server. A new installation creates its Admin in the web app first.

Plain `http://` works in debug builds only; a release build needs an `https://` address ([why](../docs/standards/mobile.md#running-against-a-local-server)).

## Checks

Run these from this folder before you commit. CI runs the same four (the `mobile` job).

| What | Command |
| --- | --- |
| Install exactly what the lockfile says | `flutter pub get --enforce-lockfile` |
| Format check | `dart format --output=none --set-exit-if-changed .` (fix with `dart format .`) |
| Lint and types | `flutter analyze --fatal-infos` |
| Tests | `flutter test` |

The pre-commit hook does not format Dart files, so that a commit never needs the Flutter SDK. Run `dart format .` yourself.

Tests need no device and no network: they run the whole app against a fake API ([Testing](../docs/standards/mobile.md#testing)).

## Build

```sh
flutter build apk --debug      # Android, for testing
```

A release build needs signing set up for each store, which is not done yet. iOS builds need a Mac; the iOS folder has not been built or run so far.

## Dependencies

Every version in `pubspec.yaml` is exact and `pubspec.lock` is committed. Adding or changing a package needs the owner's approval ([security practices](../docs/standards/security.md#dependency-rules)).
