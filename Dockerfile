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

# whisper: compile whisper.cpp binary + download model for voice STT
FROM debian:bookworm-slim AS whisper-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential cmake curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /whisper && \
    cd /whisper && \
    cmake -B build -DWHISPER_BUILD_EXAMPLES=ON && \
    cmake --build build --config Release -j$(nproc)
# Download base.en model (~75MB, fast on CPU)
RUN curl -fsSL -o /whisper/ggml-base.en.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

# piper: download prebuilt binary + voice model for voice TTS
FROM alpine:latest AS piper-downloader
RUN apk add --no-cache curl tar
RUN curl -fsSL -o /tmp/piper.tar.gz \
    https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz && \
    mkdir -p /piper && tar -xzf /tmp/piper.tar.gz -C /piper --strip-components=1
# Download voice model
RUN curl -fsSL -o /piper-model.onnx \
    https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx && \
    curl -fsSL -o /piper-model.onnx.json \
    https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# migration: minimal image to run database migrations (no ffmpeg/python/build deps)
FROM node:22-alpine AS migration

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

# production: Debian-based runtime (glibc) so Piper works natively
FROM node:22 AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 make g++ libgomp1 which && \
    rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
# Full install (not --prod) so drizzle-kit and tsx are available
RUN pnpm install --frozen-lockfile

COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Copy whisper binary + shared libs (with symlinks preserved)
COPY --from=whisper-builder /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper-builder /whisper/build/src/libwhisper.so /usr/local/lib/
COPY --from=whisper-builder /whisper/build/src/libwhisper.so.1 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/src/libwhisper.so.1.8.4 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml.so /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml.so.0 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml.so.0.11.1 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml-base.so /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml-base.so.0 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml-base.so.0.11.1 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml-cpu.so /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml-cpu.so.0 /usr/local/lib/
COPY --from=whisper-builder /whisper/build/ggml/src/libggml-cpu.so.0.11.1 /usr/local/lib/
RUN ldconfig

# Model goes where the bot expects it
RUN mkdir -p /app/models
COPY --from=whisper-builder /whisper/ggml-base.en.bin /app/models/ggml-base.en.bin

# Piper needs its libs + espeak-ng-data at runtime — copy entire directory
COPY --from=piper-downloader /piper /usr/local/lib/piper
RUN ln -s /usr/local/lib/piper/piper /usr/local/bin/piper
COPY --from=piper-downloader /piper-model.onnx /app/models/en_US-lessac-medium.onnx
COPY --from=piper-downloader /piper-model.onnx.json /app/models/en_US-lessac-medium.onnx.json
RUN chmod +x /usr/local/bin/whisper-cli /usr/local/bin/piper

# Copy source and run directly with tsx instead of pre-compiling
COPY src/ ./src/
COPY tsconfig.json ./

CMD ["sh", "-c", "pnpm db:migrate && pnpm exec tsx src/index.ts"]
