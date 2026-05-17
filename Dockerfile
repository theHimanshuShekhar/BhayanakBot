# base: full deps + source
FROM node:22-alpine AS base

RUN apk add --no-cache ffmpeg python3 make g++ gcompat
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/
COPY biome.json ./
COPY vitest.config.ts ./

# whisper: compile whisper.cpp binary for voice STT
FROM alpine:latest AS whisper-builder
RUN apk add --no-cache git build-base cmake
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /whisper && \
    cd /whisper && \
    cmake -B build -DWHISPER_BUILD_EXAMPLES=ON && \
    cmake --build build --config Release -j$(nproc)

# piper: download prebuilt binary for voice TTS
FROM alpine:latest AS piper-downloader
RUN apk add --no-cache curl tar
RUN curl -fsSL -o /tmp/piper.tar.gz \
    https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz && \
    tar -xzf /tmp/piper.tar.gz -C /tmp && \
    mv /tmp/piper/piper /piper

# migration: minimal image to run database migrations (no ffmpeg/python/build deps)
FROM node:22-alpine AS migration

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

# production: runtime image with drizzle-kit for startup migration + source
FROM node:22-alpine AS production

RUN apk add --no-cache ffmpeg python3 make g++ gcompat libgomp
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
# Full install (not --prod) so drizzle-kit and tsx are available
RUN pnpm install --frozen-lockfile

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Copy voice binaries
COPY --from=whisper-builder /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=piper-downloader /piper /usr/local/bin/piper

# Copy source and run directly with tsx instead of pre-compiling
COPY src/ ./src/
COPY tsconfig.json ./

CMD ["sh", "-c", "pnpm db:migrate && pnpm exec tsx src/index.ts"]
