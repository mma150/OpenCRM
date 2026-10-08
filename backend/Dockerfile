# Development image only. No application code is baked in: compose bind-mounts
# ./backend over /app, which would hide it anyway.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim

# The slim image ships no OpenSSL; Prisma's schema engine warns and guesses without it.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# corepack fetches the pnpm version pinned in package.json "packageManager"
RUN corepack enable

WORKDIR /app

COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh

ENTRYPOINT ["dev-entrypoint.sh"]
