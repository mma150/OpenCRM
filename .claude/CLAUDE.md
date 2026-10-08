<!-- GSD:project-start source:PROJECT.md -->

## Project

**OpenCRM**

OpenCRM is an open source, self-hosted CRM for small sales teams (roughly 5–50 people). Sales people track their own leads, opportunities, follow-ups and customer conversations; admins and managers see exactly what the sales team is doing and when. It ships first as a responsive web app (Next.js frontend, Node/Express/Prisma backend), with a Flutter mobile app to follow.

**Core Value:** A sales person can log every lead and every conversation against it, and an admin can open any lead and see the dated history of what was discussed and what happens next.

### Constraints

- **Tech stack**: Next.js + Redux Toolkit (frontend), Node + Express + Prisma (backend), Flutter (mobile, later) — chosen by the owner
- **Language**: TypeScript on frontend and backend — type safety and one language for contributors
- **Database**: PostgreSQL via Prisma — default assumption, not yet challenged by the owner
- **Tenancy**: single organisation per installation
- **License**: Apache-2.0
- **Design**: simple, readable code over clever abstractions; a new contributor should be able to find where a feature lives from the folder names
- **Responsive**: all web screens must work on phone, tablet and desktop
- **Commits**: short messages following the repo's commit standard; never include Claude co-author or AI attribution trailers
- **Security**: vulnerabilities must be tracked continuously in CI, not audited once

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
