# Development image only. No application code is baked in: compose bind-mounts
# ./frontend over /app, which would hide it anyway.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim

# corepack fetches the pnpm version pinned in package.json "packageManager"
RUN corepack enable

WORKDIR /app

# No telemetry from the local stack.
ENV NEXT_TELEMETRY_DISABLED=1

# Webpack mode is required: Turbopack does not see edits made through a Docker
# Desktop (Windows) bind mount. The bind mount hides anything installed at build
# time, so dependencies are installed at every start (a no-op when current).
CMD ["sh", "-c", "pnpm install --frozen-lockfile && exec pnpm exec next dev --webpack -H 0.0.0.0 -p 3000"]
