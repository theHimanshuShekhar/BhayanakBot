# base: full deps + source, used for building and running migrations
FROM node:22-alpine AS base

RUN apk add --no-cache ffmpeg python3 make g++
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

# build: compiles TypeScript on top of base
FROM base AS build
RUN pnpm build

# production: lean runtime image with only prod deps + compiled output
FROM node:22-alpine AS production

RUN apk add --no-cache ffmpeg python3
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
