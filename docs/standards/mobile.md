# Mobile standard

How the Flutter app in `mobile/` is built: folders, the API client, state with Riverpod, the shared widgets, role rules, theming, tests, and how to run it against a local server. The working example is the **leads** feature, [`mobile/lib/features/leads/`](../../mobile/lib/features/leads/), with the timeline it shows from [`mobile/lib/features/timeline/`](../../mobile/lib/features/timeline/). Each rule says what enforces it; the table at the end lists them.

The app is a second client of the same API as the web app. It mirrors the web app's ideas (feature folders, one API client, one place for error words, the same access rules and the same wording), not its code.

Related: [structure](structure.md), [backend](backend.md), [frontend](frontend.md), [security](security.md), [decision 0005](../decisions/0005-mobile-app-stack.md).

## Folders

```text
mobile/
├── pubspec.yaml  pubspec.lock        Exact versions; the lockfile is committed
├── analysis_options.yaml             The lint contract (flutter_lints plus strict modes)
├── android/  ios/                    The two platform folders; almost no code of our own
├── lib/
│   ├── main.dart                     runApp inside a ProviderScope
│   ├── app/                          The app itself
│   │   ├── app.dart                  MaterialApp.router, themes, theme mode
│   │   ├── routes.dart               Every path, by name (Routes.lead(id))
│   │   ├── navigation.dart           THE navigation file: tabs, their routes, the More list
│   │   ├── router.dart               go_router and the sign-in redirect
│   │   ├── record_routes.dart        recordRoute (a record's page) and appRouteForWebPath (the API's web links)
│   │   └── app_shell.dart            Bottom bar on a phone, navigation rail on a tablet
│   ├── core/                         What every feature shares
│   │   ├── api/                      api_client.dart, dio_api_client.dart, api_error.dart,
│   │   │                             error_messages.dart, json.dart, paged.dart, server_address.dart
│   │   ├── auth/                     auth_controller.dart (session, current user), user.dart (roles)
│   │   ├── storage/                  key_value_store.dart (secure storage; memory in tests)
│   │   ├── state/                    paged_notifier.dart (every paged list)
│   │   ├── theme/                    app_colors.dart, app_theme.dart, app_spacing.dart, theme_controller.dart
│   │   ├── format/                   formatters.dart (dates, money, initials, the tz the API is sent)
│   │   └── widgets/                  The shared widgets (table below)
│   └── features/
│       ├── auth/                     server_address_screen.dart, sign_in_screen.dart, forgot_password_screen.dart,
│       │                             starting_screen.dart
│       ├── home/                     dashboard.dart (model), dashboard_providers.dart, home_screen.dart
│       ├── leads/                    lead.dart, leads_api.dart, leads_providers.dart, leads_list_screen.dart,
│       │                             lead_detail_screen.dart, lead_form_screen.dart, lead_sheets.dart
│       ├── contacts/                 contact.dart, contacts_api.dart, contacts_providers.dart, contacts_list_screen.dart,
│       │                             contact_detail_screen.dart, contact_form_screen.dart, contact_picker.dart,
│       │                             company_contacts_card.dart (the Contacts card on a company's page)
│       ├── companies/                company.dart, companies_api.dart, companies_providers.dart, companies_list_screen.dart,
│       │                             company_detail_screen.dart, company_form_screen.dart, company_picker.dart
│       ├── timeline/                 record_ref.dart (the record types), timeline_entry.dart, timeline_api.dart,
│       │                             timeline_providers.dart, timeline_labels.dart, timeline_section.dart,
│       │                             timeline_sheets.dart (log conversation, add note)
│       ├── custom_fields/            custom_fields.dart (model, provider, the read-only card),
│       │                             custom_fields_form.dart (the fields of the four record forms)
│       ├── users/                    reassign_sheet.dart (assignable users and the Reassign sheet)
│       ├── tasks/                    task.dart, tasks_api.dart, tasks_providers.dart, tasks_screen.dart,
│       │                             task_row.dart (the row and its checkbox), task_sheet.dart (add, edit, delete),
│       │                             task_record_picker.dart, record_tasks_card.dart (the Tasks card of a record page)
│       ├── notifications/            notification.dart, notifications_api.dart, notifications_providers.dart,
│       │                             notification_bell.dart (the bell and the poller), notifications_screen.dart
│       ├── activity/                 activity_entry.dart, activity_providers.dart, activity_labels.dart, activity_screen.dart
│       └── more/                     more_screen.dart (profile, theme, server, sign out, version)
└── test/
    ├── support/                      fake_api.dart, fixtures.dart, pump_app.dart
    ├── core/  app/  features/        Tests, in the folders of the code they test
```

- **A feature folder carries the name of the API module and the web feature** (`leads`, `timeline`, `tasks`), so all three halves are found from one name ([the mirror rule](structure.md#the-mirror-rule)). A Dart folder cannot hold a hyphen: `custom-fields` is `custom_fields`.
- **File names are `snake_case`**, the Dart convention (the lint `file_names`), where the web and the API use kebab-case. Classes are `PascalCase`, everything else `camelCase`.
- **Imports are package imports** (`package:opencrm/...`), never relative, so a file can move without its imports changing (lint `always_use_package_imports`).
- Cross-feature code goes in `core/`. A feature may import another feature's **model, provider or widget made to be shared** (leads shows `TimelineSection`), never its screens.
- **There is no generated code.** Models are plain classes with a hand-written `fromJson` ([decision 0005](../decisions/0005-mobile-app-stack.md)).

## Building a feature, step by step

Leads is the example. A new feature of owned records (contacts, companies, opportunities) copies these files and renames.

### 1. `lead.dart`: the model

A plain immutable class, enums that carry the API's value and the words shown for it, and a `fromJson` that reads through the helpers of [`core/api/json.dart`](../../mobile/lib/core/api/json.dart):

```dart
enum LeadStatus {
  newLead('NEW', 'New', Tone.neutral),
  contacted('CONTACTED', 'Contacted', Tone.warning),
  // ...
  const LeadStatus(this.apiValue, this.label, this.tone);
}

factory Lead.fromJson(Json json) {
  return Lead(
    id: readString(json, 'id'),
    status: LeadStatus.fromApi(readString(json, 'status')),
    owner: PersonRef.fromJson(asMap(json['owner'])),
    followUpAt: readDateOrNull(json, 'followUpAt'), // local time
    // ...
  );
}
```

- Never print a raw API value: the enum has the `label`.
- `readDate` gives **local time**; send a moment back with `toApiMoment` (UTC).
- A wrong shape throws `FormatException`, which a screen shows as an error with Retry, never as a crash.
- Decide per enum what an **unknown value** from a newer server means. A timeline kind falls back to `unknown` and is still shown; a role falls back to Read-only (the least access); a lead status throws, because guessing a status would offer the wrong actions.
- What a form sends is its own small class with `toJson` (`LeadInput`): text trimmed, empty text as `null`.

### 2. `leads_api.dart`: the routes

One class that takes the `ApiClient`, with a function per route that returns the **unwrapped data**. Lists return a `Page<T>`. Nothing else in the feature builds a path or a query.

```dart
class LeadsApi {
  const LeadsApi(this._client);
  final ApiClient _client;

  Future<Page<Lead>> list(LeadsQuery query, int page) async {
    final response = await _client.get('/leads', query: query.toListQuery(page).toQuery());
    return Page.fromResponse(response, Lead.fromJson);
  }

  Future<Lead> get(String id) async => Lead.fromJson(asMap((await _client.get('/leads/$id')).data));
}

final leadsApiProvider = Provider((ref) => LeadsApi(ref.watch(apiClientProvider)));
```

`ListQuery` ([`core/api/paged.dart`](../../mobile/lib/core/api/paged.dart)) is the query string every list of the API shares ([List endpoints](backend.md#list-endpoints)): `search`, `sort`, `order`, `page`, `pageSize` and filters named after their field. An empty filter is left out.

### 3. `leads_providers.dart`: the state

See [State with Riverpod](#state-with-riverpod). A list is a `PagedNotifier`, one record is an `AsyncNotifier` family with a method per change.

### 4. The screens

- **The list** (`leads_list_screen.dart`): `AppScaffold`, `SearchField`, `FilterChipBar`, and `PagedListView` with the state and the three actions of the list's notifier. The main action ("New lead") is a labelled button in the app bar, shown only to a role that may write.
- **The record page** (`lead_detail_screen.dart`): the header card, banners, then `TimelineSection` or the details (`DetailList`, `CustomFieldsCard`). Actions that write sit in the menu and in the bottom bar, and only for `role.canWriteRecords`.
- **The form** (`lead_form_screen.dart`): see [Forms](#forms), with the record type's custom fields at the end ([Custom fields in a form](#custom-fields-in-a-form)).
- **Sheets** (`lead_sheets.dart`): short forms opened with `showAppSheet`.

### 5. Navigation

Add the paths to [`routes.dart`](../../mobile/lib/app/routes.dart) and the routes to [`navigation.dart`](../../mobile/lib/app/navigation.dart); see [Navigation](#navigation). Nothing else changes.

### 6. Tests

See [Testing](#testing).

## The API client

[`ApiClient`](../../mobile/lib/core/api/api_client.dart) is the one way the app talks to the API. Feature API files call `get`, `post`, `patch`, `put` and `delete` with a path that starts after `/api/v1`, and get an `ApiResponse` with the envelope taken off: `data` and `meta`.

- **Two implementations, one seam.** [`DioApiClient`](../../mobile/lib/core/api/dio_api_client.dart) is the real one and the only file that imports dio. The tests' `FakeApi` is the other. They differ only in `perform`; what happens around a request is shared in `ApiClient.send`.
- **The server address and the token belong to the auth controller.** It sets `serverUrl`, `token` and `onUnauthenticated` on the client. The token travels as `Authorization: Bearer`, as [the API's token sign-in](backend.md#authentication-and-access) expects. No cookie is ever used.
- **Every failure is an [`ApiError`](../../mobile/lib/core/api/api_error.dart)** with `code`, `message`, `details`, `statusCode` and `requestId` (the `X-Request-Id` header). Besides the API's codes there are four of the app's own: `NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE` (the answer is not the API's envelope: probably not an OpenCRM server) and `UNEXPECTED` (a bug on this side).
- **Switch on `code`, never on the HTTP status or the message** ([backend.md](backend.md#error-codes-d-12)). `error.fieldErrors` gives a validation failure as `{ path: message }`; `error.retryAfterSeconds` reads the lock and rate-limit detail.
- **A session that has ended is handled in one place.** When any answer carries `UNAUTHENTICATED`, the client calls `onUnauthenticated`, the auth controller signs the user out, and the router shows the sign-in screen. The check is on the code, never on HTTP 401: a wrong password is a 401 too. No screen or notifier redirects by itself.
- **The words for an error come from one function**, `describeApiError` in [`error_messages.dart`](../../mobile/lib/core/api/error_messages.dart), with the web app's wording. A code it does not know shows the code and the server's sentence. When a feature meets a code that is not in it yet (`QUOTE_NOT_EDITABLE`), add the case there with the sentence the web uses.

## Signing in and the server address

OpenCRM is self-hosted, so the app first asks **where the server is** ([`server_address_screen.dart`](../../mobile/lib/features/auth/server_address_screen.dart)). `ServerAddress.parse` turns what was typed into the stored address (`crm.example.com` becomes `https://crm.example.com`; a trailing `/` or `/api/v1` is dropped), and the address is saved only after `GET /health` answered there.

[`AuthController`](../../mobile/lib/core/auth/auth_controller.dart) owns the session. Its state is one of:

| Status | Meaning | Screen |
| --- | --- | --- |
| `starting` | Reading what was saved, asking `GET /auth/me` who the token belongs to | `/starting` |
| `startFailed` | The saved session could not be checked (offline, server down). The token is kept | `/starting`, with Retry and Sign out |
| `needsServer` | No server address: the first launch | `/server` |
| `signedOut` | A server, no session | `/sign-in` (and `/server` to change it) |
| `signedIn` | `user` is set | the tabs |

- **Sign-in** is `POST /auth/token` ([backend.md](backend.md#authentication-and-access)); the token goes into the device's secure storage ([`key_value_store.dart`](../../mobile/lib/core/storage/key_value_store.dart): the Keychain on iOS, Keystore-backed storage on Android) and nowhere else. Android backups are off (`allowBackup="false"`), so it never leaves the device.
- **Sign-out** forgets the token on the device first, then calls `POST /auth/logout` with it. Being offline never keeps someone signed in on the phone.
- **Changing the server signs out**: a token belongs to one server.
- **The router decides who sees what** with one function, `redirectFor(status, location)` in [`router.dart`](../../mobile/lib/app/router.dart), run on every navigation and whenever the status changes.
- **"Forgot password?"** opens [`forgot_password_screen.dart`](../../mobile/lib/features/auth/forgot_password_screen.dart) (`/forgot-password`, pushed over the sign-in screen with the email typed there). It sends `POST /auth/forgot-password` `{ email }` (`AuthController.requestPasswordReset`) and then always says the same thing, "If that email exists, we sent a link. It is valid for 1 hour.", because the API answers 200 whether or not the email has an account ([backend.md](backend.md#authentication-and-access)). The email's link opens the **web app's** reset page (the server builds it from its own `APP_URL`), so the phone needs no browser and the link can be opened on any device; the screen says so. `RATE_LIMITED`, an unreachable server and a refused email are said with `describeApiError` and `ServerErrors` like any form. The router lets only a signed-out user see it.
- Only three values are stored on the device: the server address, the token and the theme choice. Records are always read from the API; there is no offline cache.

## State with Riverpod

Plain `Notifier` classes and providers, written by hand (no `riverpod_generator`). Three shapes cover everything so far.

### A paged list: `PagedNotifier`

[`core/state/paged_notifier.dart`](../../mobile/lib/core/state/paged_notifier.dart) has the state of every list (`PagedState<T>`: the rows, `total`, `hasMore`, the first-load state and error, the load-more state and error) and its controller. A feature says only how a page is fetched:

```dart
class LeadsListController extends PagedNotifier<Lead> {
  late LeadsQuery _query;

  @override
  PagedState<Lead> build() {
    _query = ref.watch(leadsQueryProvider); // a new search or filter starts the list again
    return start();
  }

  @override
  Future<Page<Lead>> fetchPage(int page) => ref.read(leadsApiProvider).list(_query, page);

  @override
  Object idOf(Lead item) => item.id;
}
```

`start()` loads the first page; `retry()`, `refresh()` (pull to refresh: the rows stay until the new page arrives, and a failure is thrown so the screen can say so) and `loadMore()` do the rest. An answer that belongs to an earlier search is dropped, a page is never asked for twice, and a row is never shown twice. The search text, filter and sort live in their own small notifier (`leadsQueryProvider`) that the list watches.

A list whose argument is data (the timeline of one record under one filter) is a **family**: the notifier takes the argument in its constructor (`TimelineController(this.args)`).

### One record: an `AsyncNotifier` family

```dart
class LeadController extends AsyncNotifier<Lead> {
  LeadController(this.id);
  final String id;

  @override
  Future<Lead> build() {
    ref.watch(sessionUserIdProvider);
    return ref.read(leadsApiProvider).get(id);
  }

  Future<void> changeStatus(LeadStatus status) async {
    _changed(await _api.changeStatus(id, status), wroteTimeline: true);
  }
}
```

- **A method per change.** It calls the API, puts the answer (the record as the server now has it) into the state, and throws the `ApiError` to whoever called it. There is no optimistic update.
- **A change tells the screens that show the data**: `leadsChanged(ref)` invalidates the leads list and the dashboard, and `refreshTimelines(ref, record)` the record's timelines when the change wrote an entry. A new feature writes its own `<records>Changed` function and calls it from every method that changes something.
- Screens read `ref.watch(leadProvider(id))` and call `ref.read(leadProvider(id).notifier).changeStatus(...)`.

### Read-only data: a `FutureProvider`

The dashboard, the custom fields of a record type and the assignable users are a `FutureProvider`. The custom fields stay read for the session; a record form asks for them again when it opens, so a field an Admin added or made required since is in the form. Refresh with `ref.invalidate(...)` (or `ref.refresh(provider.future)` under a pull to refresh).

### Rules for all three

- **Every provider that holds data read from the server watches `sessionUserIdProvider`** (`PagedNotifier.start()` does it for every list). Signing out, or someone else signing in on the same phone, then throws the data away instead of showing it to the next person. `shell_test.dart` has the test.
- **Automatic retry is off.** Riverpod 3 retries a failed provider by itself; the app passes `retry: noRetry` to its `ProviderScope` (and the tests to theirs), because a screen that failed says so and offers Retry.
- **A provider's `build` never sets its own state.** `PagedNotifier.start()` and the auth controller start their first load in a microtask, after `build` has returned.
- After an `await` in a notifier, check `ref.mounted` before setting the state; in a widget, check `mounted` (or `context.mounted`) before using the context.
- Widgets get the signed-in user from `currentUserProvider`.

## Forms

Anything that changes data from a form follows one recipe; `lead_form_screen.dart` and `timeline_sheets.dart` are the examples.

```dart
Future<void> _save() async {
  setState(() => _errors = ServerErrors.none);
  if (!_formKey.currentState!.validate()) return; // nothing is sent
  setState(() => _saving = true);
  try {
    await ref.read(leadProvider(id).notifier).save(input);
    if (!mounted) return;
    showSuccessSnackBar(context, 'Lead saved.');
    context.go(Routes.lead(id));
  } on ApiError catch (error) {
    if (mounted) {
      setState(() {
        _errors = ServerErrors.from(error, fields: _fields);
        _saving = false;
      });
    }
  }
}
```

- **Check before sending** with each field's `validator`, with the web app's sentences. The server stays the authority: its limits are the `maxLength` of the fields.
- **`ServerErrors.from(error, fields: ...)`** sorts what the API said: a `VALIDATION_FAILED` detail whose `path` is a field of this form goes under that field (`serverError: _errors['email']`), every other detail and every other code goes above the form in `FormErrorBanner`. Nothing the server said is lost: a path the form has no field for (a custom field the form could not read) is shown above it.
- **Editing a field clears its server message** (`_errors.without('email')`).
- **`SubmitButton(saving: ...)`** cannot be pressed twice.
- **A form is a `Column` in a `SingleChildScrollView`**, never a `ListView`: a `ListView` drops the fields scrolled out of view, and a field that is not there is not validated.
- A full-screen form is a route above the tabs (`parentNavigatorKey: rootNavigatorKey`); a short one is a sheet (`showAppSheet`).

### Custom fields in a form

The lead, contact, company and opportunity forms end with the custom fields of their record type, through one widget in [`custom_fields_form.dart`](../../mobile/lib/features/custom_fields/custom_fields_form.dart), the app's side of the web's `custom-fields-form.tsx` ([backend.md](backend.md#custom-fields) has the rules):

```dart
late final _custom = CustomFieldValues(stored: widget.lead?.customFields); // null stored: a new record
// in _save:
final fields = ref.read(customFieldsProvider(RecordType.lead)).value ?? const [];
customFields: existing == null ? _custom.forCreate(fields) : _custom.changes(fields),
_errors = ServerErrors.from(error, fields: {..._fields, ...customFieldPaths(fields)});
// after Notes:
CustomFieldsSection(recordType: RecordType.lead, values: _custom, errors: _errors, onEdited: _clearError),
```

- **One control per field in use**, in the Admin's order, under a "Custom fields" heading: `TEXT` is a text box (500 characters), `NUMBER` a text box with the number keyboard, sent as a JSON number, `DATE` the platform's date picker (`DayField`), sent as `2026-11-15`, `DROPDOWN` the options after "None". A required field has a red `*` (and "required" for a screen reader). A record type without custom fields shows nothing; while they load a placeholder; when they cannot be read a sentence with Retry, and the rest of the form still works.
- **Checked before sending with the API's rules** (`CustomFieldValues.validate`, the web's sentences): a required field must be filled in on a new record, and cannot be emptied on one that has a value (a record from before the field became required stays editable); a number is `12`, `-12` or `12.5`.
- **A new record sends the fields filled in; an edit sends only the ones changed** (the API merges key by key), with `null` for one that was emptied. Nothing filled or changed leaves `customFields` out of the request.
- **A dropdown value whose option was removed since** is shown as "East (removed option)" and kept as long as it is not changed (it is then not sent); it is never offered to another record.
- **The server's messages** at `customFields.<field id>` go under the field, and editing it takes them away (`onEdited`).
- The record pages keep the read-only `CustomFieldsCard`.

## Navigation

[`navigation.dart`](../../mobile/lib/app/navigation.dart) is the one file that lists where things are; the router and the shell are built from it.

| To add | Do |
| --- | --- |
| A page under an existing tab (a contact's page) | A `GoRoute` in that tab's `routes`, and its path in `routes.dart` |
| A page reached from the More tab (Contacts, Companies, Opportunities, Notifications) | Its routes in `moreRoutes` (relative to `/more`), and one `MoreItem` in `moreItems` with its label, icon, full path and section heading |
| A row only some roles see (Activity: everyone but a Sales Rep) | `visibleTo: (role) => role.seesTeamOverview` on the `MoreItem`. It hides a row that would lead to `FORBIDDEN`; the API enforces the rule |
| A tab | An `AppTab` in `appTabs`. Four tabs fit a phone; think twice |
| A form that covers the bottom bar | `parentNavigatorKey: rootNavigatorKey` on its route |

- Navigate with the names of `routes.dart`: `context.go(Routes.lead(id))`. `go` builds the whole stack from the path, so Back always has somewhere to go.
- Each tab keeps its own stack and scroll position; tapping the tab that is shown goes back to its first page.
- From 720 logical pixels wide the shell shows a navigation rail instead of the bottom bar.

## The timeline

One feature serves every kind of record, as on the web and in the API ([backend.md](backend.md#the-timeline)).

- [`record_ref.dart`](../../mobile/lib/features/timeline/record_ref.dart) is **the one table of record types**: `RecordType` has `lead`, `contact`, `company` and `opportunity` with the first part of their routes. A record is a `RecordRef(type, id)`.
- **A record page shows its history with one widget**: `TimelineSection(record: RecordRef(RecordType.contact, id), canWrite: ...)`, inside the page's own scroll view. It has the filter (All, Conversations, Notes, Changes), the entries and "Load more".
- **Writing**: `showLogConversationSheet(context, record: ..., recordName: ..., onSaved: ...)` and `showAddNoteSheet(...)`. Pass `onSaved` to read the record again when a conversation moves something on it (a lead's "last contact").
- **After a change that writes an entry** (a status change, an assignment) call `refreshTimelines(ref, record)`.
- The words for an entry are in [`timeline_labels.dart`](../../mobile/lib/features/timeline/timeline_labels.dart), the same as the web's `timeline-labels.ts`. They already cover the entries of all four record types, quotes and invoices included.
- **A converted lead's history follows it.** The timeline of a contact, a company or an opportunity made from a lead also carries that lead's entries, merged by date by the API, each with `fromLead: { id, name }` (null on the record's own entries, on a lead's timeline and in the activity feed; an older server that leaves it out reads as null). `TimelineEntryTile` titles such an entry as the lead's ("Lead created", "Converted") and adds a line "From lead <name>" that opens the lead, as the web's `timeline-entry.tsx` does. Writing a conversation or a note still writes on the record itself.
- Entries are permanent: there is no edit and no delete, in the API or here.

## Shared widgets

Use these before writing a new one. All are in [`mobile/lib/core/widgets/`](../../mobile/lib/core/widgets/).

| Widget | File | Use |
| --- | --- | --- |
| `AppScaffold` | `app_scaffold.dart` | The frame of every screen: app bar with the title and `actions`, the body in the safe area and capped to a readable width, an optional `bottomBar` of buttons |
| `ContentWidth` | `app_scaffold.dart` | Caps a child at 720 logical pixels and centres it |
| `PagedListView` | `paged_list_view.dart` | Every paged list: pull to refresh, the next page as the end comes near, skeleton, empty, error with Retry, and a failed next page with Retry under the rows |
| `SearchField` | `list_controls.dart` | The search box of a list; reports a moment after the typing stops |
| `FilterChipBar`, `FilterOption` | `list_controls.dart` | A row of chips that picks one value; scrolls sideways by itself |
| `showOptionsSheet`, `SheetOption` | `dialogs.dart` | A sheet that offers a short list and answers with the choice (a sort order, a status) |
| `showAppSheet` | `dialogs.dart` | Every bottom sheet: above the keyboard, scrollable, over the bottom bar |
| `showConfirmDialog` | `dialogs.dart` | Asks before something that cannot be undone |
| `showSuccessSnackBar`, `showErrorSnackBar` | `snackbars.dart` | "Lead saved." and what did not happen |
| `AppTextField`, `PasswordField`, `AppDropdownField`, `DateTimeField`, `DayField`, `LabeledField` | `form_fields.dart` | Form controls with the label above them (`required: true` marks the label with `*`). `DayField` picks a calendar day without a time (`toApiDay`, `formatDay`) |
| `ServerErrors`, `FormErrorBanner`, `SubmitButton` | `form_fields.dart` | The form recipe above |
| `StatusBadge`, `ToneBanner`, `InitialsAvatar` | `status_badge.dart` | A status pill, a banner inside a page, a person's initials |
| `EmptyState`, `ErrorState`, `SectionCard`, `MutedText` | `state_views.dart` | Nothing to show; failed with Retry; a card with a title; secondary text |
| `Skeleton`, `SkeletonCard`, `SkeletonList` | `skeleton.dart` | Placeholders while loading. They do not animate |
| `DetailList`, `DetailItem` | `detail_list.dart` | The facts of a record; a value can be selectable |
| `showRecordPicker`, `PickedRecord`, `RecordPickerField` | `record_picker.dart` | A sheet that finds one record by typing against a list endpoint, and the form field that holds the choice. Features wrap it: `showCompanyPicker`, `showContactPicker` |
| `FollowUpCard`, `showRecordFollowUpSheet` | `follow_up.dart` | The follow-up reminder of a record (set, change, clear), given the time, the note and the function that sends them |

Shared by features rather than `core/`: `TimelineSection` and the two timeline sheets (`features/timeline`), `CustomFieldsCard`, `CustomFieldsSection` and `CustomFieldValues` (`features/custom_fields`), `showReassignSheet` (`features/users`), `RecordTasksCard`, `TaskRow` and `showTaskSheet` (`features/tasks`).

## Roles

The four roles and what they may do are in [`core/auth/user.dart`](../../mobile/lib/core/auth/user.dart), the same rules as the web's `recordAccess` and the API's [Record access](backend.md#record-access):

| Getter | True for | Use |
| --- | --- | --- |
| `role.canWriteRecords` | Admin, Sales Manager, Sales Rep | Show anything that creates, changes or deletes an owned record |
| `role.canReassignRecords` | Admin, Sales Manager | Show "Reassign" |
| `role.seesTeam` | Admin, Sales Manager | Offer other people's tasks (the Assignee choice) and narrow Home's lists to the user's own records |
| `role.seesTeamOverview` | Admin, Sales Manager, Read-only | Show the team dashboard and the activity feed |

- **The API decides and enforces.** Which records a user sees (everyone's, the team's, their own) is never worked out in the app: it shows what a list returns. The getters only avoid offering what would be refused.
- **A Read-only user gets no control that writes**: no "New", no menu, no bottom bar, no "Change status".
- A record outside the user's reach is `NOT_FOUND`, shown as an error with Retry like an id that does not exist.
- State of the record matters too: a converted lead keeps only Reassign, conversations and notes.

## Theme and layout

- **Colours are tokens.** [`AppColors`](../../mobile/lib/core/theme/app_colors.dart) has a light and a dark set (the web app's zinc neutrals and blue `#2563eb`); widgets read `context.colors.textMuted` or `context.colors.tone(Tone.warning)` and never write a colour value. A status has a `Tone` (neutral, info, success, warning, danger), and a colour never carries meaning without words beside it.
- **Spacing is tokens** too: [`AppSpacing`](../../mobile/lib/core/theme/app_spacing.dart) (`sm` 8, `md` 12, `lg` 16, `xl` 24; `radius` 8; `touchTarget` 48; `contentMaxWidth` 720).
- **The theme follows the phone** until the user picks Light or Dark on the More tab; the choice is remembered ([`theme_controller.dart`](../../mobile/lib/core/theme/theme_controller.dart)). Material 3, the platform's own font.
- **Every screen works from 320 logical pixels wide and with text at 130%.** Use `Wrap` where two things share a line only when they fit, `Expanded`/`Flexible` with `maxLines` and an ellipsis for a name beside a badge, and a scroll view around anything that can be taller than the screen. The widget tests run on a 320 x 640 phone at 130% and fail on any overflow.
- **Touch targets are at least 48 logical pixels**; every icon-only button has a `tooltip`, which is also its screen reader label; a section title is a semantic header.
- **A screen's main action is a labelled button in the app bar**, not a floating button, which would cover the last row of a list and the Retry button of an error on a small phone.
- Dates and money are written by [`formatters.dart`](../../mobile/lib/core/format/formatters.dart) only: en-US and USD, fixed, as on the web. Functions that say "today" take `now`, so tests fix the clock.
- **The `tz` the API is sent** (`deviceTimeZone()`, for the dashboards and the tasks) is the device's distance from UTC, such as `+05:30`. Dart cannot read the device's IANA zone name without a plugin; the API accepts an offset ([backend.md](backend.md#time-zones)).

## Testing

`flutter test` runs everything in `mobile/test/`, with no network and no device. Tests sit in the folder of the code they test and end in `_test.dart`.

- **The whole app runs in a widget test.** `pumpApp(tester, api: api, user: rep, location: Routes.lead('lead-1'))` in [`test/support/pump_app.dart`](../../mobile/test/support/pump_app.dart) starts the real app (router, shell, themes, controllers) signed in as that person and opens the page. Only two things are replaced: the API client and the device's storage.
- **`FakeApi`** ([`test/support/fake_api.dart`](../../mobile/test/support/fake_api.dart)) is the API of the tests. A test says what each route answers and reads back what the app sent:

  ```dart
  final api = FakeApi()
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('PATCH', '/leads/lead-1', (request) => throw validationError({'email': 'Not an email'}));
  // ...
  expect(api.sent('PATCH', '/leads/lead-1').single.json, {'status': 'QUALIFIED'});
  ```

  A handler returns the `data` (or `page(...)` for a list), throws `apiError('FORBIDDEN')` or `validationError({...})`, or returns a `Future` to keep the app waiting. The handler added last wins, so a test can change an answer part-way through. **A request no handler answers fails the test.** The feature's API file and its models are real, so a test also proves the JSON is read correctly.
- **Fixtures** ([`test/support/fixtures.dart`](../../mobile/test/support/fixtures.dart)): one user per role (`admin`, `manager`, `rep`, `readOnly`) and JSON builders (`leadJson(status: 'LOST')`, `entryJson(...)`, `dashboardJson(...)`) that take only what a test is about. Add a builder for each new model.
- **Two phones.** `testWidgets('...', variant: phones, (tester) async { ... })` runs the test on a 360 x 800 phone in the light theme and on a 320 x 640 phone in the dark theme with text at 130%. Flutter reports an overflow as an error, so either one fails the test. `surface: tablet` checks the wide layout. Use the variant for every screen and every state of it; a test of logic only needs one run.
- **Helpers**: `enterField(tester, 'Email', '...')`, `field('Email')`, `chooseOption(tester, 'Source', 'Referral')`, `tapVisible(tester, finder)` (scrolls to it first), `scrollTo(tester, finder)`. A tap that lands on something else fails the test.
- **Mind what is built.** A page builds only what is near the screen, so on the small phone scroll to what you check, as a user would. A page under another page, and a tab that is not shown, are paused: they load again when they are next shown.

What every new feature tests:

1. The model: `fromJson` with every field, the nulls, and an unknown enum value.
2. The API file through the screens: the method, path, query and body the app sent.
3. The list: loading, empty (by role), error with Retry, search, each filter and sort, the next page, a failed next page, pull to refresh.
4. The record page: what it shows, and what each of the four roles is and is not offered.
5. Each change: what is sent, the success message, and the screens that must show the change.
6. Each form: nothing is sent when the check before sending fails; a server message under its field; one test per error code the screen can get, above the form; no second send while one is on its way.
7. Unit tests for anything with rules of its own (formatters, labels, a controller).

## Running against a local server

Start the stack ([README](../../README.md)), then from `mobile/`:

```sh
flutter pub get
flutter run          # on a connected device or a running emulator
```

On the first screen enter the address of the API:

| Running on | Server address |
| --- | --- |
| Android emulator | `http://10.0.2.2:4000` (the host machine as the emulator sees it; use your `API_PORT` if you changed it) |
| iOS simulator | `http://localhost:4000` |
| A real phone on the same network | `http://<the computer's address>:4000` |

The app adds `/api/v1` itself. A server on a real domain is entered as it is opened in a browser when the API is served from the same address; otherwise enter the API's own address.

**Plain HTTP is for debug builds only.**

- The app accepts an `http://` address only when it is not a release build (`ServerAddress.parse`, `allowHttp: !kReleaseMode`).
- Android: cleartext traffic is switched on in [`android/app/src/debug/AndroidManifest.xml`](../../mobile/android/app/src/debug/AndroidManifest.xml) only; the main manifest says `usesCleartextTraffic="false"`.
- iOS: App Transport Security stays on; `Info.plist` allows local networking only (`NSAllowsLocalNetworking`). This has not been run on a device yet: there is no Mac in the project.
- A release build therefore needs an `https://` address. There is no exception for a local address; an installation on a private network needs a certificate its phones trust.

The mobile app needs no CORS entry and no `Origin`: it sends no cookie, so the API's origin check lets it through ([backend.md](backend.md#authentication-and-access)).

## Dependencies

Adding or changing a package needs the owner's approval, exactly as for the two other apps ([security.md](security.md#dependency-rules)). Versions in `pubspec.yaml` are exact (no `^`), `pubspec.lock` is committed, and CI installs with `flutter pub get --enforce-lockfile`. The Flutter version is pinned in `environment.flutter` in `pubspec.yaml` and in the `mobile` job of CI; change both together.

Approved today: `flutter_riverpod`, `dio`, `go_router`, `flutter_secure_storage`, `intl`, and `flutter_lints` for development. No code generation packages.

## Contacts and companies

[`features/contacts/`](../../mobile/lib/features/contacts/) and [`features/companies/`](../../mobile/lib/features/companies/) are the leads recipe twice, reached from the More tab (`/more/contacts`, `/more/companies`). What they add to it:

- **Picking a record.** `showCompanyPicker(context, selectedId: ...)` and `showContactPicker(context, selectedId: ..., companyId: ...)` open a sheet that searches the list endpoint as the user types (the first 20 by name) and answer a `PickedRecord` (`id`, `name`), or null when the sheet is closed. In a form, `RecordPickerField` holds the choice and its cross clears it. Both are built on `showRecordPicker` in [`core/widgets/record_picker.dart`](../../mobile/lib/core/widgets/record_picker.dart); a picker for another kind of record is one more small function like them.
- **A record inside another follows the API.** A contact's `company` and `convertedFromLead` are `{ id, name }` or null, and null also means "one you may not see" ([backend.md](backend.md#record-access)): the page then shows no link, and never a guess. A company the API refuses in a form (`VALIDATION_FAILED` on `companyId`) is said under the Company field.
- **A company's contacts** are the `CompanyContactsCard` (owned by `contacts`, shown by the company page): the first 5 by name with the total, "Add contact" (`Routes.newContactIn(companyId)`, the form with `?companyId=`), and "View all", which sets the company on `contactsQueryProvider` and opens the contacts list. The list says "Company: ..." in a chip that takes the filter off.
- **Industries** are free text. `companyIndustriesProvider` (`GET /companies/industries`) feeds the list's filter chips and the form's suggestions; both screens work without it while it loads or when it fails.
- **A change tells the other feature too.** `contactsChanged` also reloads the companies list, the open company and its contacts card (a company shows how many contacts it has); `companiesChanged` also reloads the contacts list (a contact's row names its company).
- **A website is text**, written without its scheme, that can be selected and copied: opening a browser needs `url_launcher`.
- A contact's page reads the contact again after a conversation (its "last contact" moved); a company has no such field. Deleting a company says its contacts stay and lose the link, with the web app's sentence.

## Opportunities and the pipeline

[`features/opportunities/`](../../mobile/lib/features/opportunities/) is the leads recipe again, reached from the More tab (`/more/opportunities`) and from the "Pipeline value" tile of Home. The stages are [`features/pipeline_stages/`](../../mobile/lib/features/pipeline_stages/) (`Stage`, `StageKind`, `pipelineStagesProvider`): they are set up in the web app and only read here ([backend.md](backend.md#the-pipeline-and-opportunities)). What the feature adds to the recipe:

- **One screen, two views.** `OpportunitiesScreen` switches between Pipeline and List (`opportunitiesViewProvider`, which remembers the choice). The list is a `PagedNotifier` like any other, with a stage filter, a status filter (Open, Won, Lost) and the web app's sort orders.
- **The pipeline shows one stage at a time**: a row of stage chips with their counts (the open stages, then Won, then Lost), then that stage's total and its cards. `GET /opportunities/board` carries at most 50 cards per stage; a stage that holds more says "Showing 50 of N" with "View all in the list", which sets the stage on `opportunitiesQueryProvider` and switches the view.
- **Moving a card is optimistic** (the other optimistic update is a task's checkbox, see [Tasks](#tasks)). "Move to stage" opens a sheet of the other stages; `BoardController.move` puts the card in its new stage at once (`placeCard`, which also moves the counts and totals), and puts it back in its old place if the API refuses, with a snackbar that says why. Everything else still waits for the server, as [One record](#one-record-an-asyncnotifier-family) says. Choosing Won or Lost in that sheet opens `showCloseSheet` instead: the reason is required for lost and optional for won. A closed card has "Reopen" in place of "Move to stage".
- **Two controllers change an opportunity**: `BoardController` (move, close, reopen from a card) and `OpportunityController` (the page: also save, assign, follow-up, delete). Each tells the other's screens: the page's changes call `opportunitiesChanged` (the list, the board and the dashboard load again); the board's put the server's answer into the board and invalidate the list, the dashboard and that opportunity's page and timeline.
- **`status` is the kind of the stage**, so one enum (`StageKind`) serves both. A stage's name is an Admin's choice and is shown as it is; a kind this version does not know throws, like a lead status.
- **An edit sends only what changed** (`OpportunityInput.changesFrom`), unlike the lead form. A company or contact the reader may not see is null in the answer; sending every field back would unlink it. A new opportunity sends what was filled in and also chooses its stage (the open ones; the first when the stages cannot be read).
- **`expectedCloseDate` is a calendar day** (`"2026-11-15"`): it is picked without a time (`DayField`), sent with `toApiDay` and shown with `formatDay`, never moved into a time zone.
- **The follow-up is shared**: `FollowUpCard` and `showRecordFollowUpSheet` in [`core/widgets/follow_up.dart`](../../mobile/lib/core/widgets/follow_up.dart) take the time, the note and a function that sends them, so they serve any record with `PUT .../follow-up`. A closed opportunity takes no new follow-up; one that is still set can be cleared. (The lead page still has its own copy of the same sheet.)
- **The company, the contact and the lead it came from** are rows on the Details half that open their pages. Quotes and invoices are not in the app.

## Tasks

[`features/tasks/`](../../mobile/lib/features/tasks/) is the Tasks tab and everything that shows a task elsewhere. A task is not an owned record: who sees one is the API's rule ([backend.md](backend.md#tasks)).

- **The open view is four requests**, one per `due` group (`overdue`, `today`, `upcoming`, `none`) with `status=OPEN`, as on the web, so the API decides what is overdue by the device's day (`tz`). `openTasksProvider` holds the four pages (50 tasks each; the count beside each heading is the API's total). The chips show all groups, one group, or Done (a `PagedNotifier`, newest first).
- **Whose tasks**: the user's own by default; an Admin and a Sales Manager pick a person or Everyone (`TaskAssignee`, sent as `assigneeId`). A Read-only user is never given a task, so they get everyone's.
- **The checkbox is optimistic.** `TaskRow` is the row everywhere (the Tasks tab, Home, a record's card). `completeTask` puts the id in `completedTaskIdsProvider` before the request, which takes the task out of every open list at once (`stillOpen`); a refusal takes it out again, so the task is back, with a snackbar that says why. The confirmation offers Undo (reopen). Every change calls `tasksChanged`: the lists, the record cards, Home and the team figures load again.
- **The task sheet** (`showTaskSheet(context, task: ..., record: ...)`) is a full-screen page above the tabs: title, description, due date and time, assignee (`assignableUsersProvider`), linked record (a type, then the shared record picker over that type's list endpoint, `task_record_picker.dart`), and the reminder (None, At due time, 1 hour before, 1 day before, Custom). The API stores one `reminderAt`; `ReminderChoice.of` reads a saved one back. An edit sends only what changed (`TaskInput.changesFrom`). A Read-only user gets the task's details instead.
- **The address**: `/tasks?open=<id>` (`Routes.openTask`, a notification's link) reads that task and opens its sheet; `/tasks?due=<group>` (`Routes.tasksDue`, a Home tile) shows one group. Both are taken from the address once and removed from it.
- **A record's page shows its open tasks** with one widget, inside the page's scroll view, between the header cards and the timeline:

  ```dart
  RecordTasksCard(
    record: RecordRef(RecordType.contact, contact.id),
    recordName: contact.name,
    canWrite: role.canWriteRecords,
  )
  ```

  It lists the first 5 (`recordType` + `recordId`, soonest first) with "Show all", and "Add task" with the record filled in. It is on the lead, contact, company and opportunity pages. It pushes the timeline down: on the small phone a test scrolls to the timeline before checking it.
- **A linked record is a link only when the app has its page**: `recordRoute(type, id)` in [`app/record_routes.dart`](../../mobile/lib/app/record_routes.dart) is the one table; a type it does not know is shown as a name.

## Notifications

[`features/notifications/`](../../mobile/lib/features/notifications/). **Nothing is pushed to the phone**: there is no push service and no background work (both need packages that are not approved).

- **The bell** is in the app bar of the first page of every tab, with the unread count on it (in its tooltip too, for a screen reader). The shell puts it there through `TabBarActions` ([`app_scaffold.dart`](../../mobile/lib/core/widgets/app_scaffold.dart)); a page under a tab keeps its own actions.
- **The count is polled while the app is in the foreground**: `UnreadCountPoller` (around the shell, so only while someone is signed in) asks `GET /notifications/unread-count` at once, every 60 seconds, and the moment the app comes back to the foreground; when the app goes to the background (`WidgetsBindingObserver`) it stops. A failed ask keeps the last number and says nothing. A count that changed reloads the list.
- **The page** (`/more/notifications`, also a row of the More tab) lists them newest first, page by page. An unread one has a bolder title and a "New" badge. A tap marks it read (at once on screen; a failure is not worth a message) and follows its `link`: the API writes paths of the web app, and `appRouteForWebPath` turns `/tasks?open=<id>`, `/leads/<id>`, `/opportunities/<id>` (and the contact and company pages) into the app's routes. Anything else, or a full address, is not followed: a snackbar says to open it in the web app. "Mark all as read" sits above the list.

## The team dashboard and the activity feed

Both are for `role.seesTeamOverview` (Admin, Sales Manager, Read-only: a Read-only user is there to watch the team); the API answers `FORBIDDEN` to a Sales Rep, and **the app never asks for them on a Sales Rep's behalf**: the widgets are not mounted, the More row is hidden, and the providers themselves refuse before any request (`teamDashboardProvider`, `ActivityController.fetchPage`). The tests give a Sales Rep no handler for these routes, so a request would fail them. The web's CSV export of the feed is not in the app.

- **Team** is a section at the bottom of Home ([`features/home/team_section.dart`](../../mobile/lib/features/home/team_section.dart)): range chips (This month, Last month, Last 7 days, Last 30 days; sent as the device's days with `tz`), a card per person with the eight figures of the web table, a Total card, and a sort choice (name, or a figure highest first, sorted on the phone).
- **Activity** (`/more/activity`) is the team's timeline entries, newest first, page by page, with a Type filter (All types, Conversations, Notes, Emails, Changes). Each entry says who did what to which record (`activity_labels.dart`, the web's sentences; an entry's own words come from `timeline_labels.dart`), and opens the record's page when the app has it. The web's person and date filters and its totals strip are not here.
- **Home links to the lists**: the task tiles open the matching group of the Tasks tab, the rows of "Tasks due" have the checkbox, a follow-up opens its lead or opportunity, a row of "Open leads by status" opens the leads list with that status, and "Pipeline value", "Won this month" and a row of "Pipeline by stage" open the opportunity list (open, won, or that stage). Home's figures are the user's own, so for an Admin and a Sales Manager the list is narrowed to their own records (`ownerId`, as on the web), with an "Only my leads" / "Only my opportunities" chip that takes the narrowing off.

## What is not here yet

- **Converting a lead** (it needs the contact, company and opportunity pages), **sending email**, **quotes and invoices**, **CSV import and export**, and everything under Settings stay in the web app.
- **Setting up custom fields** (adding, ordering, archiving them) is in the web app's Settings; the app fills them in.
- **Tap to call and tap to email** need the package `url_launcher`, which is not approved. Email addresses and phone numbers are selectable text instead. "Forgot password?" needs no browser: the server emails the link.
- **The device's IANA time zone name** needs a plugin (`flutter_timezone`); the app sends the UTC offset instead.
- **Push notifications, an offline cache, an app icon and splash screen of our own, and store signing** are not set up.

## What enforces what

| Rule | Enforced by |
| --- | --- |
| No lint issue of any level, strict casts and inference, package imports, no forgotten `await` | `flutter analyze --fatal-infos` with [`analysis_options.yaml`](../../mobile/analysis_options.yaml); the `mobile` job in CI |
| Formatting | `dart format --output=none --set-exit-if-changed .` in the `mobile` job. Not in the pre-commit hook: a commit must not need the Flutter SDK. Run `dart format .` before committing |
| Tests pass | `flutter test` in the `mobile` job |
| No overflow at 320 x 640 with text at 130%, in light and dark | The `phones` variant in the widget tests |
| A tap must land on its target | `hitTestWarningShouldBeFatal` in `pumpApp` |
| A request the test did not expect fails it | `FakeApi.unhandled`, checked by `pumpApp` |
| Exact dependency versions, a committed lockfile, the Flutter version equal in `pubspec.yaml` and CI | `pnpm verify:foundation`; `flutter pub get --enforce-lockfile` in CI |
| Weekly dependency updates | The `pub` entry in [`.github/dependabot.yml`](../../.github/dependabot.yml) |
| Custom fields: a control per type, the required check, a removed option kept, only changed keys sent, server messages under the field | `custom_fields_form_test.dart`, and a test per record form |
| A session that ended signs out by the code, not by HTTP 401 | `dio_api_client_test.dart`, `auth_controller_test.dart`, `auth_screens_test.dart` |
| The next person on a phone never sees the last one's data | `shell_test.dart` |
| The role rules | `auth_controller_test.dart` (the getters), `lead_detail_test.dart`, `leads_list_test.dart`, `shell_test.dart` |
| The team dashboard and the activity feed are never asked for a Sales Rep | `home_team_tasks_test.dart`, `activity_test.dart` (no handler for that role in `pumpApp`) |
| The unread count is polled only in the foreground | `notifications_test.dart` |
| The token is never a cookie, and only in secure storage | `auth.test.ts` in the API; code review here (`key_value_store.dart` is the only file that stores anything) |
| Only `dio_api_client.dart` imports dio, only `key_value_store.dart` imports flutter_secure_storage | Code review |
| The wording equals the web app's | Code review |
