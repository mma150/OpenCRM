# Security policy

OpenCRM holds customer and sales data, so security reports are taken seriously. Please report vulnerabilities privately, as described here, so that a fix can be ready before the problem is public.

## Supported versions

OpenCRM has not had a first release yet. Until it does, only the `main` branch is supported: reports are checked against `main`, and fixes land there. This section will list the supported release lines once releases exist.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.** Anything public can be read, and used, by anyone.

1. **Use GitHub private vulnerability reporting.** Open the repository's **Security** tab, choose **Report a vulnerability**, and fill in the form. Only the maintainers can see the report.
2. If that route is not available to you, use the fallback contact: [OWNER TO SET: security contact]

## What to include

A report is easiest to act on when it says:

- what the problem is and where it is (the page, endpoint, file or setting);
- what an attacker could do with it;
- the steps to reproduce it, or a short proof of concept;
- the version or commit you tested, and your environment (operating system, browser, how you ran the stack);
- whether you have shared the details with anyone else.

Please do not include real customer data, real credentials or anything else you are not entitled to share.

## What happens next

A maintainer reads the report and may come back with questions. If the problem is confirmed, the maintainers work on a fix and tell you when it is released. If you would like to be credited, say so in your report. No response time is promised.
