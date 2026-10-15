# Security policy

OpenCRM holds customer and sales data, so security reports are taken seriously. Please report vulnerabilities privately, as described here, so that a fix can be ready before the problem is public.

## Supported versions

OpenCRM has not had a release yet. Until it does, only the `main` branch is supported, for the API, the web app and the mobile app alike: reports are checked against `main`, and fixes land there. This section will list the supported release lines once releases exist.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.** Anything public can be read, and used, by anyone.

Report it through **GitHub private vulnerability reporting**:

1. Open <https://github.com/mma150/OpenCRM/security/advisories/new>, or open the repository's **Security** tab and choose **Report a vulnerability**. You need to be signed in to GitHub.
2. Fill in the form. Only you and the maintainers can see the report and the conversation that follows.

This is the only way to report a vulnerability. There is no security email address.

## What to include

A report is easiest to act on when it says:

- what the problem is and where it is (the page, endpoint, file or setting);
- what an attacker could do with it;
- the steps to reproduce it, or a short proof of concept;
- the version or commit you tested, and your environment (operating system, browser or phone, how you ran the stack);
- whether you have shared the details with anyone else.

Please do not include real customer data, real credentials or anything else you are not entitled to share.

## What happens next

A maintainer reads the report and may come back with questions in the same private report. If the problem is confirmed, the maintainers work on a fix and tell you when it is released. If you would like to be credited, say so in your report. No response time is promised.

How the project keeps its own code and dependencies safe (secret scanning, code scanning, dependency audits) is described in [docs/standards/security.md](docs/standards/security.md).
