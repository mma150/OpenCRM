# 0001: Pin Node.js to the 24 line

## Status

Accepted by the owner on 2026-10-08.

## Context

The project pins one Node.js version, the current active LTS, and runs no multi-version test matrix (D-04). On 2026-10-08 the active LTS is Node 24. By the Node.js release schedule read that day, Node 24 moves to maintenance on 2026-10-20 and Node 26 becomes LTS on 2026-10-28, and Node 24 is supported until 2028-04-30. The Prisma 7.10 documentation recommends Node 24. The decision therefore falls on the day the active LTS is about to change, and the owner was asked whether to pin 24 or 26.

## Decision

Pin the **24 line**. The major version is written in these places, and they are changed together:

- [`.nvmrc`](../../.nvmrc) (`24`), the source for local version managers, which CI must select its Node version from as well (D-04);
- `engines.node` (`>=24 <25`) in the root, `backend/` and `frontend/` `package.json` files;
- the `NODE_VERSION` build argument of the `api` and `web` services in [`compose.yaml`](../../compose.yaml) (the Dockerfiles default to `24` as well).

Node 26 is not adopted yet because it is not an LTS release at the time of the decision and the toolchain here (Prisma, Next.js) has not been checked against it.

**To bump the version:** change the places above in one pull request, rebuild the images (`docker compose build`), run the full check, test and build commands for both apps, and update this record or supersede it with a new one.

## Consequences

- One version everywhere, so "works on my machine" differences between local development, containers and CI come from the OS, not from Node.
- The version is written in more than one file; a bump that misses one is caught only by running the stack, so follow the list above.
- `engine-strict` is deliberately not enabled, so a host with a different Node (the maintainer's machine runs 25.6) gets an "Unsupported engine" warning from pnpm rather than a hard stop. The containers and CI use 24.
- Node 24 leaves active LTS on 2026-10-20 but stays supported until 2028-04-30, which leaves room to move to 26 deliberately rather than urgently.
