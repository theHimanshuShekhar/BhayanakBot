FROM imbios/bun-node:latest

WORKDIR /app

COPY package*.json ./

COPY . .

RUN bun install

RUN bun run build

ENV PORT 3999

EXPOSE 3999

CMD ["bun", "run", "start"]