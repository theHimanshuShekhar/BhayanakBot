# base: full deps + source
FROM node:22-alpine AS base

RUN apk add --no-cache ffmpeg python3 make g++ gcompat
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY web/ ./web/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/
COPY biome.json ./
COPY vitest.config.ts ./

RUN pnpm build

# migration: minimal image to run database migrations (no ffmpeg/python/build deps)
FROM node:22-alpine AS migration

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

# production runtime
FROM node:22 AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# Keep dev tools available for the Compose web service and in-container migrations,
# but run the bot from compiled JavaScript instead of tsx source.
RUN pnpm install --frozen-lockfile

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/
COPY web/ ./web/
COPY src/db/ ./src/db/
COPY tsconfig.json ./
COPY --from=base /app/dist ./dist

RUN chown -R node:node /app
USER node

CMD ["sh", "-c", "pnpm db:migrate && node dist/index.js"]
