# Collaborating on OpenCRM

OpenCRM is an open source CRM for small sales teams, and anyone may take part: people who run it, people who use it, and people who want to improve it. This guide explains how to take part, from a first bug report to a merged pull request, and how decisions are made.

It has a companion: [CONTRIBUTING.md](CONTRIBUTING.md) is the technical guide to making a change (setting up, the standards, the commit format and the checks). This guide links to it rather than repeating it.

The project is maintained by its owner, [@mma150](https://github.com/mma150) on GitHub, who reviews and merges changes and makes the decisions described below.

## Ways to help

You do not have to write code to help.

| What | How |
| --- | --- |
| **Report a bug** | Open an issue with the **Bug report** template. It asks what happened, what you expected, the steps to reproduce it, the commit or version you ran, and your environment. A bug that can be reproduced from a fresh `docker compose up` gets fixed fastest. |
| **Ask for a feature** | Open an issue with the **Feature request** template. Describe the problem a sales person or an admin has, not only the solution. Check [FEATURES.md](FEATURES.md) first: it lists what exists, the known limits and what is not available yet. |
| **Ask a question** | GitHub Discussions are not switched on for this repository, and blank issues are turned off, so open an issue with the template closest to your question. |
| **Report a vulnerability** | Never in a public issue. Use GitHub's private vulnerability reporting, as described in [SECURITY.md](SECURITY.md). |
| **Improve the documentation** | Fix what is unclear, wrong or out of date: the READMEs, [FEATURES.md](FEATURES.md) and the standards in [`docs/standards/`](docs/standards/). A documentation pull request goes through the same checks as code. |
| **Test** | Run the stack, use it as a sales team would, and report what breaks. Especially useful: web screens at phone and tablet widths, the Android app on real phones, and a first build of the iOS app on a Mac (it has never been built). |
| **Write code** | Fix a bug or build a feature that was agreed in an issue; see [The workflow](#the-workflow) below. |

**Translations are not possible yet.** The web and mobile apps are in English only and have no translation system. Adding one would be a large change across both apps, so it would start as a feature request, not as a pull request.

## The workflow

How a change gets from an idea to `main`:

1. **Start from an issue.** For anything larger than a small fix, open an issue (or comment on an existing one) and say what you plan to do before you write much code. That avoids work on something that will not be merged. Typos and small documentation fixes can go straight to a pull request.
2. **Fork the repository** on GitHub and clone your fork.
3. **Create a branch** from `main`, named after the kind of change and what it does: `feat/lead-list`, `fix/company-name-search`, `docs/mobile-setup`: the type, a slash and a short kebab-case description ([commit standard](docs/standards/commits.md#branches-and-pull-requests)).
4. **Set up.** Start the stack with `docker compose up` ([Quick start](README.md#quick-start)), then set up Node.js 24, pnpm 11 and the commit hooks on your machine as described in [Setting up to commit](CONTRIBUTING.md#setting-up-to-commit). For the mobile app you also need Flutter ([mobile/README.md](mobile/README.md#requirements)).
5. **Make the change** following the standard for the area you touch ([Standards](CONTRIBUTING.md#standards)). Copy the shape of an existing feature rather than inventing a new one, and add or update the tests.
6. **Run the checks** for every app you touched ([Running checks](CONTRIBUTING.md#running-checks)). If you changed a backend route or schema, regenerate and commit the API contract and the web types.
7. **Commit** with a short conventional message such as `fix(api): handle null company name`. The commit hook checks the format and scans for secrets. No AI attribution or `Co-Authored-By` lines.
8. **Open a pull request** into `main` from your branch. Give it a title in the same format as a commit message, and fill in the [template](.github/PULL_REQUEST_TEMPLATE.md): what changed and why, how you tested it (for a screen: phone, tablet and desktop widths), the checklist, and the linked issue.
9. **Let CI run.** On every push and pull request, CI checks the backend and the web app (lint, format, types, tests, build and the generated files), the mobile app (format, analysis and tests), the pull request title, CodeQL code scanning, the dependencies (review and audit) and secrets. A failing check blocks the merge; fix it in a new commit on the same branch.
10. **Review.** A pull request needs one approving review. Reply to comments by pushing more commits; there is no need to rewrite history, because the merge squashes it.
11. **Merge.** The pull request is merged by squash merge, so it becomes one commit on `main` whose message is the pull request title.

## How decisions are made

- **The owner decides.** The owner reviews and merges pull requests and has the final word on what goes in. The test for a feature is the project's core value: a sales person can log every lead and every conversation against it, and an admin can open any lead and see the dated history of what was discussed and what happens next.
- **Dependencies need the owner's approval.** Adding, removing or changing a package or a version, in any of the three apps, needs the owner's agreement first, and the package name is checked on its registry before it is used ([dependency rules](docs/standards/security.md#dependency-rules)). Ask in the issue before you add one. Several features are missing from the mobile app only because the package they need has not been approved.
- **Standards are followed, or changed openly.** The documents in [`docs/standards/`](docs/standards/) describe how the code is written, and the checks enforce most of them. If a standard does not fit your case, say so in an issue or in the pull request; do not quietly diverge.
- **Big decisions are written down.** A choice that is costly to reverse (a stack, a pattern every feature follows, a rule about security) is recorded as a one-page decision record in [`docs/decisions/`](docs/decisions/), with the headings Status, Context, Decision and Consequences. Read the existing ones before proposing something that touches them.
- **To propose a bigger change**, open a feature request that explains the problem, the change you suggest and the alternatives. If it is agreed, the pull request that makes it includes a new decision record when the change sets a rule others will follow, and updates the standards it affects.

## Where things live

Every feature has the same folder name in the API, the web app and the mobile app, so you can find all of it from one name ([the mirror rule](docs/standards/structure.md#the-mirror-rule)).

| Area | API (`backend/src/modules/`) | Web app (`frontend/src/features/`) | Mobile app (`mobile/lib/features/`) |
| --- | --- | --- | --- |
| Sign-in, first run, password reset | `auth` | `auth` | `auth` |
| Users and teams | `users` | `users` | `users` (reassigning only) |
| Leads | `leads` | `leads` | `leads` |
| Contacts, companies | `contacts`, `companies` | `contacts`, `companies` | `contacts`, `companies` |
| Opportunities and the pipeline | `opportunities`, `pipeline-stages` | `opportunities`, `pipeline-stages` | `opportunities`, `pipeline_stages` |
| Timelines and the activity feed | `timeline`, `activity` | `timeline`, `activity` | `timeline`, `activity` |
| Tasks and notifications | `tasks`, `notifications` | `tasks`, `notifications` | `tasks`, `notifications` |
| Dashboards | `dashboard` | `dashboard` | `home` |
| Custom fields | `custom-fields` | `custom-fields` | `custom_fields` |
| CSV import | `imports` | `imports` | none |
| Email | `email-settings`, `email-templates`, `emails` | the same three | `emails` |
| Products, quotes, invoices | `products`, `organization`, `quotes`, `invoices` | the same four | `quotes` |

Code shared by every module is in `backend/src/lib/` and `backend/src/middleware/`, `frontend/src/components/`, `frontend/src/lib/` and `frontend/src/store/`, and `mobile/lib/core/`. The database schema is `backend/prisma/schema.prisma`, and the API contract is `backend/openapi/openapi.json`. Each app's README describes its folders: [backend](backend/README.md), [frontend](frontend/README.md), [mobile](mobile/README.md).

## Good first areas

- **Documentation** that confused you while you set up. You are the best judge of what a newcomer is missing.
- **Issues labelled `good first issue` or `help wanted`**, when there are some.
- **Checking web screens** at 375px, 768px and 1280px wide in both themes, with long names and email addresses, and reporting or fixing what overflows ([responsive rules](docs/standards/frontend.md#responsive-rules)).
- **Building and running the iOS app** on a Mac, and reporting what happens. Nobody has done it yet.
- **Tests** for a rule that is described in a standard but that you find no test for.
- **A production deployment setup.** The repository has none yet ([Running in production](README.md#running-in-production)). This is a bigger change, so start with an issue.

## Communication and response times

- Everything happens on GitHub: issues for bugs, requests and questions, and pull requests for changes. Keep discussions in the open there, so that others can find them later.
- The project is maintained in the owner's own time, and **no response time is promised**. A clear issue with steps to reproduce, or a small pull request that passes its checks, is the easiest to answer.
- Security reports are private and follow [SECURITY.md](SECURITY.md).
- Be kind and assume good intent. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md); a possible violation is reported privately to the maintainer, as it explains.

## Recognition

- A merged pull request becomes a commit on `main` under your name, and GitHub lists you among the repository's contributors.
- OpenCRM is copyright "The OpenCRM contributors" ([NOTICE](NOTICE)), which includes you once a contribution of yours is merged.
- People who report a vulnerability are credited if they ask to be ([SECURITY.md](SECURITY.md#what-happens-next)).

## Licence

OpenCRM is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it is licensed under the same terms ([CONTRIBUTING.md](CONTRIBUTING.md#licence)).

## See also

- [CONTRIBUTING.md](CONTRIBUTING.md): the technical guide to making a change
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): how we treat each other
- [SECURITY.md](SECURITY.md): reporting a vulnerability
- [LICENSE](LICENSE) and [NOTICE](NOTICE)
- [FEATURES.md](FEATURES.md): what OpenCRM does today
