# Phase 2: Authentication, Users & App Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 2-Authentication, Users & App Shell
**Areas discussed:** Sessions & login rules, Invites & email delivery, App shell & navigation, Teams & user rules

---

## Sessions & login rules

### How should a login be kept after the user signs in?

| Option | Description | Selected |
|--------|-------------|----------|
| Server sessions in a cookie (Recommended) | Sessions stored in PostgreSQL, httpOnly cookie in the browser; logout and deactivation are immediate; Flutter can use a token header later | ✓ |
| JWT access + refresh tokens | Short-lived access token plus rotated refresh token; a deactivated user stays valid until the access token expires | |
| You decide | Let research and planning pick | |

**User's choice:** Server sessions in a cookie

### How long should a login last?

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days, renewed on use (Recommended) | Ends after 30 days without activity | ✓ |
| 7 days, renewed on use | A week without activity signs the user out | |
| "Remember me" checkbox | Browser-session login unless ticked, then 30 days | |
| Fixed 24 hours | Everyone signs in again daily | |

**User's choice:** 30 days, renewed on use

### What should happen after repeated wrong passwords?

| Option | Description | Selected |
|--------|-------------|----------|
| Rate limit only (Recommended) | Attempts refused for a few minutes; no account is ever locked | |
| Rate limit + temporary lock | Also lock the account for 15 minutes after about 10 wrong passwords | ✓ |
| Lock until Admin unlocks | Account stays locked until an Admin reactivates it | |

**User's choice:** Rate limit + temporary lock
**Notes:** Chosen over the recommendation. The stated trade-off was that anyone who knows an email can lock that person out for the lock period.

### What password rules should apply?

| Option | Description | Selected |
|--------|-------------|----------|
| Length only, 10+ characters (Recommended) | No forced character classes; very common passwords rejected | ✓ |
| Length 8+ with mixed characters | Uppercase, lowercase and a digit | |
| Length 12+ with mixed characters | Plus a symbol | |

**User's choice:** Length only, 10+ characters

### Can one person be signed in on several devices?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, any number (Recommended) | Each device has its own session | ✓ |
| Yes, with a session list | Plus a list of active sessions on the profile page | |
| One device at a time | A new sign-in ends the previous one | |

**User's choice:** Yes, any number

### What happens to other devices when a password changes or is reset?

| Option | Description | Selected |
|--------|-------------|----------|
| Sign out all other devices (Recommended) | Current device stays signed in on change; a reset ends all sessions | ✓ |
| Keep all sessions | Other devices stay signed in until they expire | |

**User's choice:** Sign out all other devices

### How is the first Admin account created?

| Option | Description | Selected |
|--------|-------------|----------|
| Setup screen in the browser (Recommended) | One-time page while no user exists, closed afterwards | ✓ |
| Setup screen + setup token | Also asks for a token from the API log or env file | |
| Env variables / CLI command | No setup page | |

**User's choice:** Setup screen in the browser

### What should a failed sign-in message say?

| Option | Description | Selected |
|--------|-------------|----------|
| Same message for both (Recommended) | Does not reveal which emails have accounts; deactivated users get a distinct message only after a correct password | ✓ |
| Specific messages | "No account with that email" versus "Wrong password" | |

**User's choice:** Same message for both

---

## Invites & email delivery

### How does a newly invited user get their password?

| Option | Description | Selected |
|--------|-------------|----------|
| Emailed link, user sets it (Recommended) | Account shows as "Invited" until the link is used | ✓ |
| Admin sets a temporary password | User must change it at first login | |
| Both | Link by default, temporary password as an option | |

**User's choice:** Emailed link, user sets it

### What should invites and resets do when email is not set up?

| Option | Description | Selected |
|--------|-------------|----------|
| Show the Admin a copyable link (Recommended) | Invite still works; Admins can generate a reset link; a banner says email is off | ✓ |
| Require email to be configured | Fail with a clear error until SMTP is set | |
| Always show the link, and email too | Link shown even when email works | |

**User's choice:** Show the Admin a copyable link

### How long should emailed links stay valid?

| Option | Description | Selected |
|--------|-------------|----------|
| Invite 7 days, reset 1 hour (Recommended) | Single-use; resending an invite cancels the old link | ✓ |
| Invite 48 hours, reset 30 minutes | Tighter windows | |
| Invite never expires, reset 1 hour | Invite works until used or cancelled | |

**User's choice:** Invite 7 days, reset 1 hour

### Where should emails go in local development?

| Option | Description | Selected |
|--------|-------------|----------|
| Mail catcher in Compose (Recommended) | A local web inbox; one more container | ✓ |
| Print links in the API log | No extra container | |
| You decide | Let research and planning choose | |

**User's choice:** Mail catcher in Compose

---

## App shell & navigation

### What should the main navigation look like?

| Option | Description | Selected |
|--------|-------------|----------|
| Left sidebar, drawer on phones (Recommended) | Sidebar collapses to icons on tablet and a slide-in drawer on phones | |
| Top bar only | Links across a top bar, collapsing into a menu on phones | |
| Sidebar + bottom tabs on phones | Sidebar on desktop; bottom tab bar with the most used sections plus "More" on phones | ✓ |

**User's choice:** Sidebar + bottom tabs on phones
**Notes:** Chosen over the recommendation. Which sections sit in the tabs was not discussed and is left to Claude's discretion.

### What should a user see right after signing in?

| Option | Description | Selected |
|--------|-------------|----------|
| Simple welcome home page (Recommended) | Greeting, role and shortcuts; replaced by the dashboard in Phase 6 | ✓ |
| Role-based landing | Admins on Users, everyone else on Profile | |
| Keep the status page as home | Reuse the Phase 1 status page | |

**User's choice:** Simple welcome home page

### Should the app have a dark theme?

| Option | Description | Selected |
|--------|-------------|----------|
| Light and dark, follows the device (Recommended) | Tokens for both, with a Light / Dark / System switch | ✓ |
| Light only | One theme | |
| Tokens for both, no switch yet | Follows the device, no switch | |

**User's choice:** Light and dark, follows the device

### Which shape should lists take on phones?

| Option | Description | Selected |
|--------|-------------|----------|
| Table on desktop, cards on phones (Recommended) | The one list pattern later modules copy | ✓ |
| Table everywhere, fewer columns on phones | Hide less important columns | |
| You decide | Let the UI design step pick | |

**User's choice:** Table on desktop, cards on phones

---

## Teams & user rules

### How should a manager's team work?

| Option | Description | Selected |
|--------|-------------|----------|
| Each rep has one manager (Recommended) | Optional Manager field; no team records | ✓ |
| Named teams, one team per rep | Teams as records with a name and one manager | |
| Named teams, reps in several teams | Many-to-many | |

**User's choice:** Each rep has one manager

### What protects an install from losing its last Admin?

| Option | Description | Selected |
|--------|-------------|----------|
| Block it (Recommended) | Last active Admin cannot be deactivated or demoted; no self-deactivation | ✓ |
| Warn but allow | Confirmation, then allowed | |

**User's choice:** Block it

### What happens to a deactivated user?

| Option | Description | Selected |
|--------|-------------|----------|
| Signed out at once, data kept (Recommended) | Sessions end; account and history stay; never deleted | ✓ |
| Signed out at once, plus a delete option | Also allow deleting users who never signed in | |
| Blocked at next sign-in only | Existing sessions run until they expire | |

**User's choice:** Signed out at once, data kept

### Who can change a user's email address?

| Option | Description | Selected |
|--------|-------------|----------|
| Admin only (Recommended) | Users edit their own name and password | ✓ |
| User, with confirmation email | Applies after a link sent to the new address is clicked | |
| User and Admin, no confirmation | Applies at once | |

**User's choice:** Admin only

---

## Claude's Discretion

- Exact rate-limit thresholds and the exact wrong-password count for the temporary lock
- Bottom-tab contents on phones and the tablet behaviour of the sidebar
- Password hashing, cookie attributes, CSRF approach, token generation and storage
- Common-password check source
- Mailer, rate limiter, mail-catcher image, form handling and which shadcn components form the shared set
- Forms as pages or dialogs; wording of loading, empty and error states
- What happens to reps' Manager field when their manager is deactivated or changes role
- What becomes of the Phase 1 status page once Home exists

## Deferred Ideas

None raised. Declined options: active-sessions list, "Remember me", Admin-set temporary passwords, deleting never-activated users, self-service email change.
