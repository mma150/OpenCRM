# OpenCRM mobile

The OpenCRM app for phones and tablets, written in Flutter. It is a second client of the same versioned API as the web app, described by [`backend/openapi/openapi.json`](../backend/openapi/openapi.json), and it connects to whichever OpenCRM server you point it at. It has been built and tested on Android only; the iOS project exists but has not been built or run yet.

How the app is built, and how to add a feature, is in the [mobile standard](../docs/standards/mobile.md). Why these packages: [decision 0005](../docs/decisions/0005-mobile-app-stack.md).

## What it does

- **Connecting**: on first launch the app asks for the server address and checks it before saving it. Sign in, sign out, "Forgot password?", and change the server from the More tab.
- **Home**: your open leads by status, your pipeline by stage, tasks due and overdue, follow-ups that are due and opportunities won this month, each linking to its list. Admins, Sales Managers and Read-only users also get the team figures for a date range.
- **Leads**: search, filter, create, edit, change status, mark as lost, reopen, reassign, set a follow-up, delete.
- **Contacts and companies**: search, filter, create, edit, reassign, delete; a company's contacts.
- **Opportunities**: the pipeline one stage at a time, and the list; create, edit, move to another stage, close as won or lost, reopen, reassign, follow-up, delete.
- **Timelines**: every record's dated history; log a conversation and add a note.
- **Custom fields** on every record's form and page.
- **Tasks**: grouped as overdue, today, upcoming and no date; add, edit, delete, and tick off with Undo. A record's open tasks are on its page.
- **Notifications**: a bell with the unread count, checked every 60 seconds while the app is open, and the list.
- **Activity**: the team's activity feed, filtered by kind (Admin, Sales Manager and Read-only).
- **Quotes**: read a quote, share its PDF through the phone's share sheet, and email it with the PDF attached (using the templates written in the web app).
- **Roles**: the same four roles and rules as the web app. The API decides what each user sees; the app does not offer what the API would refuse, and a Read-only user gets no control that changes anything.
- Light and dark themes, from 320 logical pixels wide and with text at 130%.

**What stays in the web app**: first-run setup, accepting an invite and choosing a new password (the emailed links open the web app), the profile page, converting a lead, sending an email from a record, writing email templates, making and changing quotes, invoices, CSV import and export, custom field filters on lists, the activity feed's person and date filters, and everything under Settings. The full list of features by role is in [FEATURES.md](../FEATURES.md).

## Requirements

- **Flutter 3.47.6**, the version pinned in `environment.flutter` in [`pubspec.yaml`](pubspec.yaml) and in the `mobile` job of CI (the two must be equal; `pnpm verify:foundation` checks it). It comes with the Dart SDK the app needs.
- **For Android**: the Android SDK (through Android Studio or the command-line tools) and an emulator or a phone with USB debugging.
- **For iOS**: a Mac with Xcode. Nobody has built the iOS app yet, so expect to be the first.
- **An OpenCRM server**: the development stack from the repository root (`docker compose up`, see the [README](../README.md#quick-start)), or a real installation.

## First run

1. Start the server: `docker compose up` in the repository root. A new installation needs its first Admin, created in the web app at <http://localhost:3000>.
2. From this folder:

   ```sh
   flutter pub get --enforce-lockfile
   flutter run
   ```

3. On the first screen enter the address of the API. The app adds `/api/v1` itself.

   | Running on | Server address |
   | --- | --- |
   | Android emulator | `http://10.0.2.2:4000` (the computer, as the emulator sees it) |
   | iOS simulator (untested) | `http://localhost:4000` |
   | A phone on the same network | `http://<your computer's address>:4000` |

   Use your `API_PORT` instead of 4000 if you changed it. A server on a real domain is entered as you open it in a browser, for example `crm.example.com`, which the app turns into `https://crm.example.com`.

4. Sign in with an account of that server.

**Plain `http://` works in debug builds only.** A release build accepts only an `https://` address, with no exception for local addresses, so an installation on a private network needs a certificate its phones trust. On Android, cleartext traffic is switched on only in the debug manifest ([`android/app/src/debug/AndroidManifest.xml`](android/app/src/debug/AndroidManifest.xml)). Details: [Running against a local server](../docs/standards/mobile.md#running-against-a-local-server).

The app stores three things on the device: the server address, the session token (in the platform's secure storage) and the theme choice. Records are always read from the server; there is no offline copy.

## Commands

Run these from this folder. CI runs the first four in this order (the `mobile` job), so run them before you push.

| What | Command |
| --- | --- |
| Install exactly what the lockfile says | `flutter pub get --enforce-lockfile` |
| Format check | `dart format --output=none --set-exit-if-changed .` (fix with `dart format .`) |
| Lint and types | `flutter analyze --fatal-infos` |
| Tests | `flutter test` |
| Android build for testing | `flutter build apk --debug` (writes `build/app/outputs/flutter-apk/app-debug.apk`) |
| Run on a device or emulator | `flutter run` |

The pre-commit hook does not format Dart files, so that a commit never needs the Flutter SDK. Run `dart format .` yourself.

Tests need no device and no network: they run the whole app against a fake API, on a small phone and a large phone, in both themes ([Testing](../docs/standards/mobile.md#testing)).

On Windows, when the pub cache and the project are on different drives, Kotlin's incremental compiler fails; [`android/gradle.properties`](android/gradle.properties) already switches it off.

## Approved packages

Every version in `pubspec.yaml` is exact and `pubspec.lock` is committed. Adding or changing a package needs the owner's approval ([dependency rules](../docs/standards/security.md#dependency-rules)).

| Package | Version | Use |
| --- | --- | --- |
| `flutter_riverpod` | 3.4.3 | State |
| `dio` | 5.11.1 | HTTP, behind one `ApiClient` |
| `go_router` | 18.0.2 | Navigation and the sign-in redirect |
| `flutter_secure_storage` | 11.2.0 | The session token, the server address and the theme choice |
| `intl` | 0.20.3 | Dates and money (en-US, US dollars) |
| `share_plus` | 13.3.0 | The share sheet, for a quote's PDF |
| `flutter_lints` | 6.0.0 | Lint rules (development only) |

There is no code generation: models are plain classes with a hand-written `fromJson`.

## Folder layout

```text
mobile/
├── pubspec.yaml  pubspec.lock  analysis_options.yaml
├── android/  ios/            The platform projects
├── lib/
│   ├── main.dart
│   ├── app/                  The app, its routes and navigation, the phone and tablet shell
│   ├── core/                 Shared: api/ (the API client and errors), auth/ (session and roles),
│   │                         storage/, state/, theme/, format/, share/, widgets/
│   └── features/             One folder per feature: activity, auth, companies, contacts,
│                             custom_fields, emails, home, leads, more, notifications,
│                             opportunities, pipeline_stages, quotes, tasks, timeline, users
└── test/                     support/ (the fake API, fixtures, pumpApp) and tests beside each folder
```

A feature folder has the name of the API module and the web feature it mirrors (a hyphen becomes an underscore: `custom_fields`). File names are `snake_case`, imports are package imports, and cross-feature code lives in `core/`.

## Adding a feature

Copy the leads feature: the model (`lead.dart`), the routes (`leads_api.dart`), the state (`leads_providers.dart`), the screens, and the tests under `test/features/leads/`; then its paths in `app/routes.dart` and its place in `app/navigation.dart`. The step-by-step guide with code is in [Building a feature, step by step](../docs/standards/mobile.md#building-a-feature-step-by-step), and what every feature must test is in [Testing](../docs/standards/mobile.md#testing).

## Not done yet

- **iOS** has not been built or run on a simulator or a device.
- **Push notifications**: there are none. Notifications are checked only while the app is open; reminders also arrive by email when the server has email set up.
- **Store release**: the app is not in the Google Play Store or the Apple App Store. Release signing is not set up (a release build is signed with the debug key), and the app has no icon or splash screen of its own yet.
- **Not in the app** (they need packages that are not approved): tap to call or email (`url_launcher`; numbers and addresses are selectable text instead), the device's time zone name (`flutter_timezone`; the app sends its offset from UTC, which can put "today" an hour off on the day of a clock change), and an offline cache.
- The web-only features listed under [What it does](#what-it-does).

The current list is kept in [What is not here yet](../docs/standards/mobile.md#what-is-not-here-yet).
