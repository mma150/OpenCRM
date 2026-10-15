# OpenCRM features

This is the full list of what OpenCRM does today, grouped by area. Each area says what a user can do and which roles can do it. It describes the code on `main`; when the two disagree, the code is right and this file needs fixing.

There are two clients of the same API: the **web app** (every feature below) and the **mobile app** for Android (most of the daily sales work; see [Mobile app](#mobile-app) for what it leaves to the web). At the end are the [known limits](#known-limits) and what is [not available yet](#not-yet-available).

## Roles at a glance

Every user has exactly one role. The API enforces the rules below on every request; the web and mobile apps only hide what the API would refuse.

| | Admin | Sales Manager | Sales Rep | Read-only |
| --- | --- | --- | --- | --- |
| Leads, contacts, companies, opportunities: sees | all | their own and their team's | their own | all |
| ... changes | all | their own and their team's | their own | none |
| Reassigns records to another owner | yes, to any active Admin, Sales Manager or Sales Rep | yes, to themselves or their team | no | no |
| Tasks: sees | all | assigned to them, made by them, or assigned to their team | assigned to them or made by them | all |
| Team dashboard and activity feed | everyone | their team | no | everyone |
| Imports CSV files | yes | yes | yes | no |
| Exports lists to CSV | yes | yes | yes | yes |
| Users, pipeline, custom fields, email server, organisation details | yes | no | no | no |
| Product catalog | manages | reads | reads | reads |

A Sales Manager's **team** is the users whose manager is that Sales Manager. A record outside a user's reach answers "not found", exactly like a record that does not exist.

## Accounts and security

- **First run.** A new installation asks for the first Admin account on its first visit, then opens on the sign-in page.
- **Sign in** with email and password. The web app keeps the session in an httpOnly cookie; the mobile app keeps a token in the phone's secure storage. A session lasts 30 days from its last use.
- **Sign out** ends the session at once. Deactivating a user or resetting their password ends their sessions too.
- **Forgot password**: a user asks for a reset link by email (valid for 1 hour). The answer is the same whether or not the email has an account.
- **Profile** (web): change your own name and password. Changing the password keeps the current session and ends the others.
- **Password rules**: 10 to 128 characters, and not on a list of common passwords.
- **Protection against guessing**: ten wrong passwords in a row lock the account for 15 minutes, and the public sign-in routes are rate limited.
- Every role has these.

## Users, roles and teams

Admin only, under Settings > Users in the web app.

- **Invite** a user with a name, email and role. The invite link is emailed and is valid for 7 days. When email is off, the Admin is shown the link to pass on instead.
- **Edit** a user's name, email, role and manager. Assign Sales Reps to a Sales Manager's team by choosing the manager.
- **Deactivate and reactivate** a user. Deactivating ends their sessions. An Admin cannot deactivate their own account, and no change may leave the installation without an Admin who can sign in.
- **Resend an invite** (the earlier link stops working) and **make a password-reset link** for a user.
- **Export** the users list to CSV (no passwords, tokens or sessions are in it).
- The four roles are fixed: Admin, Sales Manager, Sales Rep and Read-only.

## Leads

- **Create, view, edit and delete** a lead: first and last name, company name, job title, email, phone, source (Website, Referral, Cold call, Event, Other), estimated value, notes and custom fields. Deleted records are kept in the database but never shown again.
- **Status**: New, Contacted, Qualified, Lost and Converted. Move a lead between the open statuses, **mark it as lost** with a reason (Price, Chose a competitor, No budget, No response, Other) and a note, and reopen a lost lead.
- **Assign or reassign** a lead to another owner (Admin and Sales Manager).
- **Follow-up reminder**: a date and time with a note. It notifies the owner when it is due.
- **Convert** a lead into a contact (new or existing), optionally a company (new or existing) and optionally an opportunity, in one step. The lead keeps its history, and the records it became show that history in their own timelines. A converted lead can no longer be edited, but it can still be read, reassigned and written on. Web only.
- **List** with search, filters (status, owner, source, custom fields), sorting and paging. The list state is kept in the address, so a filtered list can be bookmarked.
- Who: anyone who may change the lead (see [Roles at a glance](#roles-at-a-glance)).

## Conversations and timeline

- **Log a conversation** on a lead, contact, company or opportunity: when it happened, how (call, meeting, email, message) and what was discussed.
- **Add a note** to any of those records.
- **One dated timeline per record**, newest first, combining conversations, notes, emails sent, and the changes the system records itself: created, status or stage changes, reassignments, and quote and invoice status changes. Filter it by kind.
- **Entries are permanent.** Each records who wrote it and when, taken from the server. There is no way to edit or delete an entry; a correction is a new note.
- A conversation moves the record's "last contact" date forward.
- Who: anyone who may change the record can write on it, including on a converted or lost lead and a closed opportunity. Everyone who may see the record reads its timeline.

## Contacts and companies

- **Contacts**: create, view, edit and delete; first and last name, job title, email, phone, company, notes and custom fields.
- **Companies**: create, view, edit and delete; name, website, industry, phone, address, notes and custom fields. A company's page lists its contacts. Deleting a company keeps its contacts and opportunities and removes the link.
- **Assign or reassign** either to another owner (Admin and Sales Manager).
- **Lists** with search, filters (owner, company, industry, custom fields), sorting and paging.
- Who: as for leads.

## Opportunities and pipeline

- **Create, view, edit and delete** an opportunity: name, value, expected close date, stage, contact, company, owner, notes and custom fields.
- **Pipeline board**: one column per stage with its count and total value. Move a card with its "Move to stage" menu, or by dragging it on a wide screen. A stage shows at most 50 cards and links to the full list.
- **List view** with search, filters (stage, status, owner, company, custom fields), sorting and paging.
- **Close as won or lost** with a reason (required for lost), and **reopen** a closed opportunity.
- **Follow-up reminder**, as on a lead.
- **Assign or reassign** (Admin and Sales Manager).
- **Pipeline stages** (Admin, Settings > Pipeline): add, rename, reorder and delete the open stages (up to 20). Won and Lost always exist and can only be renamed. Deleting a stage that holds opportunities moves them to another stage. A new installation starts with New, Qualified, Proposal, Negotiation, Won and Lost.
- There is one pipeline per installation.

## Tasks, reminders and notifications

- **Tasks**: a title, description, due date and time, assignee, an optional linked record (a lead, contact, company or opportunity) and an optional reminder (at the due time, 1 hour before, 1 day before, or a custom time).
- **The Tasks page** groups open tasks as Overdue, Due today, Upcoming and No due date, by the viewer's own calendar day; completed tasks are on their own view. Tick a task off from any list, with Undo.
- **A record's page** shows its open tasks, with "Add task" for that record.
- **Assigning**: a Sales Rep assigns tasks to themselves; a Sales Manager to themselves and their team; an Admin to any active user who is not Read-only. Whoever may see a task may change, complete, reopen and delete it. Read-only users see every task and change none.
- **Reminders** (a task's reminder, and the follow-up of a lead or an opportunity) are checked once a minute. When one is due, the person gets an in-app notification and, when email is set up, an email.
- **Notifications** in the app: a bell with the unread count, a list newest first, opening one goes to what it is about, mark one or all as read. Someone who is given a task by another person is notified too. Every role, for their own notifications only.

## Dashboards and activity

- **Home** (every role): the user's own open leads by status, open pipeline by stage, tasks due today and overdue, follow-ups that are due, and opportunities won this month. Every figure links to the list it counts. A Read-only user owns nothing and sees zeros. The web Home also has the outstanding and overdue invoice totals.
- **Team section** (Admin, Sales Manager and Read-only): per person for a date range, leads created, leads handled, conversations logged, opportunities won and lost, won value, open pipeline value and overdue tasks, with a total row. A Sales Manager sees their team; a Sales Rep never sees another person's figures.
- **Activity feed** (Admin, Sales Manager and Read-only): what each person did, newest first, across every record. On the web it filters by person, date range and kind, shows totals, and exports to CSV.

## Custom fields

- **Admin** (Settings > Custom fields, web): add fields to leads, contacts, companies and opportunities. Types: text, number, date and dropdown. Rename, change dropdown options, mark a field as required, reorder, archive (hidden, values kept), restore, and delete an archived field with its values. Up to 30 fields in use per record type.
- **Every role** sees the fields on record pages. Users who may change a record fill them in on its form, on the web and in the mobile app.
- **Filter** the four record lists by custom field values (text contains, a dropdown option, a number range, a date range), on the web. Exports include one column per custom field.

## Import and export

- **Import** leads, contacts or companies from a CSV file (web, every role except Read-only): map the file's columns to fields (custom fields included), choose the owner (Admin and Sales Manager), skip duplicates by email (or by name for companies), and for contacts create companies that do not exist yet. The result lists every failed row with its spreadsheet row number and the reasons, and gives a CSV file of the failed rows to fix and import again.
- **Export** to CSV (web, every role that can see the list): leads, contacts, companies, opportunities, tasks, quotes, invoices, the activity feed, products and (Admin only) users. An export holds exactly what the list shows with its search and filters, up to 10,000 rows. Cells that a spreadsheet would run as a formula are made safe.

## Email

- **Mail server** (Admin, Settings > Email, web): set the SMTP server in the app, send a test message, or remove the saved settings. Settings saved in the app win over the server's `SMTP_*` environment variables. The SMTP password is stored encrypted and is never shown again.
- **Send an email from a record** (web, anyone who may change the record): to and cc chips, a template, placeholders such as `{{contact.firstName}}`, and a preview. The email is sent under the sender's name, replies go to the sender, and the sent email appears on the record's timeline. Only an email the mail server accepted is recorded.
- **Email templates** (web, Settings > Email templates): save and reuse a subject and body with placeholders. Admin, Sales Manager and Sales Rep keep their own templates; Admin and Sales Manager can share a template with everyone. The mobile app applies templates when it emails a quote.
- Invites, password-reset links and reminders are emailed too, when email is set up.
- In the development stack every email lands in a local Mailpit inbox and nothing leaves the machine.

## Products, quotes and invoices

- **Organisation details** (Admin, Settings > Organization, web): name, address, email, phone and tax id printed on every quote and invoice, and the defaults of a new quote (terms, validity days, tax rate) and of a new invoice (payment terms).
- **Product catalog** (Settings > Products, web): Admin adds, edits, archives, restores and deletes products (name, SKU, description, unit price, tax rate). A product on a quote cannot be deleted, only archived. Every role can read and export the catalog.
- **Quotes** on an opportunity (web, anyone who may change the opportunity): line items from the catalog or typed by hand, quantity, unit price, line discount, tax rate, a discount on the whole quote (percentage or amount), notes and terms. Totals are counted by the server. Quotes are numbered Q-0001, Q-0002 and so on.
- **Quote status**: Draft, Sent, Accepted, Declined, and Expired (a sent quote past its valid-until date). Only a draft can be edited or deleted; duplicate a quote to revise one that was sent; reopen a sent, accepted or declined quote back to draft.
- **Email a quote** with its PDF attached, from the web or the mobile app. A short summary of the totals is added below the message.
- **Invoices**: turn an accepted quote into an invoice (one per quote, numbered INV-0001 and so on). The invoice is a copy and does not change when the quote, contact or products change later. Mark it sent, paid, overdue, unpaid or void, restore a void invoice, and change its due date and notes. A sent invoice past its due date reads as overdue. The invoices page shows outstanding, overdue and paid-this-month totals.
- **PDF and print**: download a quote or an invoice as a PDF file, or open a print view in the browser. Every role, Read-only included, can download and print what it can see. The mobile app shares a quote's PDF through the phone's share sheet.
- Who: quotes and invoices follow their opportunity. Whoever may see the opportunity sees its quotes and invoices; whoever may change it may change them. Read-only users see, export and print them.

## Mobile app

The Flutter app in `mobile/` is a second client of the same API, for Android phones and tablets. It asks for the server address on first launch, then signs in. See [mobile/README.md](mobile/README.md) to run it.

What it does:

- Sign in, sign out, forgot password, and changing the server.
- Home: the user's own figures, tasks due and follow-ups, and the team section for Admin, Sales Manager and Read-only.
- Leads: search, filter, create, edit, change status, mark as lost, reopen, reassign, follow-up, delete.
- Contacts and companies: search, filter, create, edit, reassign, delete; a company's contacts.
- Opportunities: the pipeline one stage at a time and the list; create, edit, move between stages, close as won or lost, reopen, reassign, follow-up, delete.
- Timeline on every record: log a conversation, add a note.
- Custom fields on every record form and page.
- Tasks: the grouped list, add, edit, delete, tick off with Undo; a record's tasks on its page.
- Notifications: the bell with the unread count and the list.
- The activity feed with a filter by kind (Admin, Sales Manager and Read-only).
- Quotes: read a quote, share its PDF, and email it with its PDF attached.
- Light and dark theme.

What stays in the web app: first-run setup, accepting an invite and choosing a new password (the emailed links open the web app), the profile page, converting a lead, sending an email from a record, writing email templates, making and changing quotes, invoices, CSV import and export, custom field filters on lists, the activity feed's person and date filters, and everything under Settings.

## Administration and settings

The web app's Settings area, by role:

| Page | Who | What |
| --- | --- | --- |
| Users | Admin | Invite, edit, deactivate and reactivate users; teams; invite and reset links; export |
| Pipeline | Admin | The pipeline stages |
| Custom fields | Admin | Fields on leads, contacts, companies and opportunities |
| Email | Admin | The outgoing mail server and a test message |
| Email templates | Admin, Sales Manager, Sales Rep | Own templates; Admin and Sales Manager can share them |
| Products | Every role (Admin manages, the others read) | The product catalog |
| Organization | Admin | The details printed on quotes and invoices, and their defaults |

There is also a page at `/status` that needs no sign-in and shows whether the API and the database are reachable.

## Known limits

- **One currency.** Amounts are US dollars, and dates and numbers are written in the US English format, on the web, in the mobile app and in PDFs. Nothing stores a currency.
- **PDF characters.** The PDF files use the PDF standard fonts, which cover Western European alphabets. Any other character (Cyrillic, Greek, Arabic, Hebrew, Chinese and others, and emoji) is printed as `?`. The browser print view does not have this limit.
- **Mobile notifications only while the app is open.** There are no push notifications. The app checks for new notifications every 60 seconds while it is in the foreground; reminders still arrive by email when email is set up.
- **iOS has not been built or tested.** The `ios/` folder exists, but no one has run the app on an iPhone or iPad yet.
- **The mobile app is not on the app stores.** Release signing, an app icon of its own and a store listing are not set up. A release build accepts only an `https://` server address.
- **Mobile time zone.** The mobile app sends the phone's offset from UTC instead of its time zone name, so "today" can be an hour off on the day of a clock change.
- **Emails are plain text**: no HTML, no open tracking, and no incoming email. A user may send 30 emails per 5 minutes, to at most 10 To and 10 Cc addresses. An email that fails is not retried.
- **Import**: leads, contacts and companies only, from CSV files of up to 5 MB and 5,000 rows. There is no import history.
- **Export**: at most 10,000 rows per file. Notifications are never exported.
- **Custom fields**: text, number, date and dropdown only, at most 30 in use per record type, and not carried over when a lead is converted.
- **Pipeline board**: at most 50 cards per stage; the rest are in the list.
- **Deleted records** cannot be restored from the app.
- **English only.** The interface is not translated.
- **One organisation per installation.**
- **Rate limits are kept in memory**, per API process.
- There is no production deployment setup in the repository yet; see [Running in production](README.md#running-in-production).

## Not yet available

None of these exist in the code today:

- Global search across all record types (each list has its own search)
- Merging duplicate records (an import can skip duplicates)
- File attachments on records
- Bulk actions on several records at once
- Tags
- A calendar view
- Saved views or saved filters (a filtered list's address can be bookmarked)
- Custom reports or a report builder
- Push notifications
- An iOS build
- A release in the Google Play Store or the Apple App Store
- More than one currency
- Sign-in with Google or Microsoft, and two-factor authentication
- Custom roles, webhooks and API keys for integrations
- Translations of the interface

To ask for one of these, open a feature request; see [COLLABORATION.md](COLLABORATION.md).
