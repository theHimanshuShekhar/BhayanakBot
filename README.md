# BhayanakBot

A fully custom Discord bot built for the Bhayanak server. Features a full RPG economy, moderation suite, music playback, leveling system, giveaways, tickets, polls, and more.

## Features

| Category | Commands |
|---|---|
| **RPG** | `/profile`, `/train`, `/work`, `/crime`, `/shop`, `/inventory`, `/pet`, `/property` |
| **Moderation** | `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history` |
| **Music** | `/play`, `/controls`, `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop` |
| **Leveling** | `/rank`, `/leaderboard`, `/rewards`, `/reset` |
| **Utility** | `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind` |
| **Fun** | `/8ball`, `/coinflip`, `/choose`, `/meme`, `/poll` |
| **Tickets** | `/ticket-panel`, `/ticket` |
| **Roles** | `/reaction-roles`, `/role-menu` |
| **Giveaways** | `/giveaway` |
| **Suggestions** | `/suggest`, `/suggestion` |
| **Auto-respond** | `/autorespond` |
| **Config** | `/config` |

### RPG System

The RPG is an economy and progression system:

- **Stats**: Strength, Agility, Intelligence, Charisma — trained with `/train`, influence job success rates
- **Jobs**: Work (fishing, construction, delivery, mining, programmer, lawyer, doctor) and Crime (pickpocket, rob player, rob bank)
- **Items**: Tools unlock jobs or improve success rates, consumables (Lucky Charm, Energy Drink, Jail Key) provide temporary boosts. Bought via `/shop` or dropped from jobs
- **Jail**: Failing a crime sends you to jail. Bail out for coins or attempt escape with an agility roll
- **Pets**: Adopt companions (common → legendary rarity) via `/pet adopt`, rename with `/pet rename`
- **Properties**: Buy housing and businesses via `/property buy`, collect passive coin income with `/property collect`
- **AI flavor text**: Job/crime outcomes get narrated by a local Ollama instance (`tinyllama` by default), with hand-written fallbacks if Ollama is unavailable

## Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **Bot framework**: [Sapphire Framework](https://www.sapphirejs.org/) v5 on Discord.js v14
- **Database**: PostgreSQL via Drizzle ORM
- **Cache/Queue**: Valkey (Redis-compatible) via BullMQ
- **Music**: discord-player v7
- **AI**: Ollama (local LLM, optional)

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Valkey or Redis
- Ollama (optional — bot works without it)

### Install

```bash
git clone https://github.com/yourusername/BhayanakBot
cd BhayanakBot
pnpm install
```

### Configure

Copy `.env.example` to `.env` and fill in:

```env
DISCORD_TOKEN=your_bot_token
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bhayanakbot
VALKEY_URL=redis://localhost:6379
OLLAMA_URL=http://localhost:11434   # optional
OLLAMA_MODEL=tinyllama              # optional
NODE_ENV=development
```

### Database

```bash
pnpm db:migrate   # run migrations
pnpm db:studio    # optional: open Drizzle UI
```

### Run

```bash
pnpm dev    # development (hot reload)
pnpm build && pnpm start  # production
```

## Docker

The included `docker-compose.yml` runs everything (Postgres, Valkey, Ollama, migrations, bot):

```bash
cp .env.example .env
# Set DISCORD_TOKEN in .env
docker compose up -d
```

Service hostnames (`postgres`, `valkey`, `ollama`) are injected automatically — `.env` values are only used for local development.

## Development

```bash
pnpm check    # lint + format (Biome)
pnpm db:push  # push schema changes without a migration (dev only)
```

Biome enforces: tabs, double quotes, trailing commas, 120-char line width.

When adding new Drizzle `pgEnum` values, always generate and run a migration — `db:push` skips enum changes.
