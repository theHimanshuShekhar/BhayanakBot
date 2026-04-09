# base: full deps + source, used for building and running migrations
FROM node:22-alpine AS base

RUN apk add --no-cache ffmpeg python3 make g++ gcompat
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

# build: compiles TypeScript and web frontend on top of base
FROM base AS build
RUN pnpm build && pnpm web:build

# production: lean runtime image with only prod deps + compiled output
FROM node:22-alpine AS production

RUN apk add --no-cache ffmpeg python3 gcompat
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist

CMD ["node", "dist/index.js"]
