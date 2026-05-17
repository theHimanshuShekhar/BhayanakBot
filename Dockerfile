# base: full deps + source, used for building
FROM node:22-alpine AS base

RUN apk add --no-cache ffmpeg python3 make g++ gcompat
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy only source files needed for build (avoid node_modules contamination)
COPY src/ ./src/
COPY web/ ./web/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/
COPY biome.json ./
COPY vitest.config.ts ./

# migration: minimal image to run database migrations (no ffmpeg/python/build deps)
FROM node:22-alpine AS migration

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

# build: compiles TypeScript and web frontend on top of base
FROM base AS build
RUN pnpm build
RUN pnpm web:build

# production: runtime image with drizzle-kit for startup migration + compiled output
FROM node:22-alpine AS production

RUN apk add --no-cache ffmpeg python3 gcompat
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
# Full install (not --prod) so drizzle-kit is available for startup migration
RUN pnpm install --frozen-lockfile

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist

CMD ["sh", "-c", "pnpm db:migrate && node dist/index.js"]
