# 0002: A tooling-only root package beside two independent apps

## Status

Accepted by the owner on 2026-10-08.

## Context

D-02 says `frontend/` and `backend/` are independent apps, each with its own `package.json` and lockfile, with no shared workspace package. Git hooks (commit message check, staged-file formatting, secret scan) need to be installed once at the repository root, where `.git` lives, and need a few development packages (husky, lint-staged, commitlint). Those packages belong to neither app.

## Decision

The repository root has a small, private `package.json` with its own `pnpm-lock.yaml` that holds **only commit tooling**. Its `pnpm-workspace.yaml` lists just the root itself (`packages: ["."]`), so `frontend/` and `backend/` are **not members** of a workspace. Each app keeps its own `package.json`, `pnpm-workspace.yaml` (pnpm settings only) and `pnpm-lock.yaml`.

This is a reading of D-02: "no shared workspace package" is taken to forbid packages shared between the apps, not a tooling package at the root that nothing imports. The owner accepted that reading.

## Consequences

- Three independent installs (root, backend, frontend) and three lockfiles. A contributor runs `pnpm install` in each (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).
- Neither app depends on the root, and no code is shared; the API contract travels as a generated file instead ([structure](../standards/structure.md)).
- Automated dependency updates and the vulnerability audit have to cover all three directories, not two.
- The root package must stay tooling-only. Application code or a dependency an app needs does not belong there.
- If a real need for shared code appears later, that is a new decision, not an extension of this one.
