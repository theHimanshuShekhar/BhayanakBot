# Two runtime targets, `bot` and `web`, built from the same lockfile (Compose picks one per service):
#   docker build --target bot .
#   docker build --target web .
# Neither ships dev dependencies or compilers.

# Base images are pinned by version and digest, so a rebuild gets the same bytes. Renovate bumps both together.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS debian
FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS alpine

# toolchain: pnpm and the compilers @discordjs/opus falls back to when no prebuilt binary matches. Only node_modules
# leaves this stage for a runtime image.
FROM debian AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
	rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.30.1
WORKDIR /app

# prod-deps: production dependencies only, native modules already built.
FROM toolchain AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# build: every dependency, to compile the bot (tsc) and build the Astro site.
FROM toolchain AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/
RUN pnpm build && pnpm web:build

# ffmpeg: a static build (~80 MB). Debian's ffmpeg package drags in ~470 MB of codec, GPU and X11 libraries.
FROM mwader/static-ffmpeg:9.0.2@sha256:7d9bdaaf887f7e6ce6151f67325c344074b5ff1fb75316011c3376503e449a7b AS ffmpeg

# bot: compiled bot and the SQL migrations it applies on start. ca-certificates for HTTPS, procps for the Compose
# healthcheck's pgrep.
FROM debian AS bot
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates procps && \
	rm -rf /var/lib/apt/lists/*
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node drizzle/ ./drizzle/
USER node
# Migrations stay in the start command. exec replaces the shell so node receives SIGTERM and can shut down cleanly.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/index.js"]

# web: the prebuilt Astro server. web/astro.config.mjs bundles its dependencies into web/dist/server, so the image
# is node and that one directory, with no node_modules.
FROM alpine AS web
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --chown=node:node --from=build /app/web/dist ./web/dist
USER node
EXPOSE 4321
CMD ["node", "web/dist/server/entry.mjs"]
