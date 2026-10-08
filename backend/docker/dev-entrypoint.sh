#!/bin/sh
# Development entrypoint for the api container. Line endings must stay LF.
# The bind mount hides anything baked into the image, so install and generate
# happen at every start (a no-op when already current).
set -e

pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy

exec pnpm dev
