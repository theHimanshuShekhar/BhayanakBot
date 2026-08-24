# BhayanakBot

A fully custom Discord bot built for the Bhayanak server. Features a full RPG economy, moderation suite, music playback, leveling system, archive-backed games and personality, giveaways, tickets, polls, and more.

## Features

| Category | Commands |
|---|---|
| **Moderation** | `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history` |
| **Music** | `/play`, `/controls`, `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop` |
| **Leveling** | `/rank`, `/leaderboard`, `/rewards`, `/level-reset` |
| **Utility** | `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind`, `/help`, `/summarize`, `/personality` |
| **Fun** | `/8ball`, `/coinflip`, `/choose`, `/meme`, `/poll` |
| **Games** | `/guess_who` |
| **Tickets** | `/ticket-panel`, `/ticket` |
| **Roles** | `/reaction-roles`, `/role-menu` |
| **Giveaways** | `/giveaway` |
| **Suggestions** | `/suggest`, `/suggestion` |
| **Auto-respond** | `/autorespond` |
| **Config** | `/config` |
| **Minecraft** | `/minecraft` |

### RPG System (currently disabled)

The RPG is an economy and progression system. It is switched off in `src/lib/features.ts` (`RPG_ENABLED = false`): the commands are not registered and daily quests are not generated, but all code and data are preserved for a future re-enable.

- **Stats**: Strength, Agility, Intelligence, Charisma — trained with `/train`, influence job success rates
- **Jobs**: Work (fishing, construction, delivery, mining, programmer, lawyer, doctor) and Crime (pickpocket, rob player, rob bank)
- **Items**: Tools unlock jobs or improve success rates, consumables (Lucky Charm, Energy Drink, Jail Key) provide temporary boosts. Bought via `/shop` or dropped from jobs
- **Jail**: Failing a crime sends you to jail. Bail out for coins or attempt escape with an agility roll
- **Pets**: Adopt companions (common → legendary rarity) via `/pet adopt`, rename with `/pet rename`
- **Properties**: Buy housing and businesses via `/property buy`, collect passive coin income with `/property collect`


### AI Personality System

The bot can build personality profiles from archived server conversation to generate contextual responses. Profile generation is currently disabled (`PERSONALITY_GENERATION_ENABLED = false` in `src/lib/features.ts`) — profiles reflect previously generated data only.

- **User Profiles**: Per-user personality profiles built from eligible archived messages. View with `/personality view user`
- **Guild Profiles**: Server culture profiles built from eligible archived messages. View with `/personality view guild`
- **Generation disabled**: startup backfill builds, the 6-hour refresh task, and `/personality refresh` subcommands are inactive until re-enabled
- **Smart Mentions**: When @mentioned, the bot uses personality context + conversation history for contextual replies
- **Random Responder**: Configurable chance-based responses in a designated channel, using guild personality for tone
- **Operational Toggle**: Server admins can enable or disable personality behavior with `/config`; this is not consent or opt-in/opt-out language

### Guess Who Game

`/guess_who` is a channel-based guessing game backed by a durable Postgres message archive:

- **Archive source**: non-bot messages from `GUESS_WHO_CHANNEL_ID` are archived with the Discord message ID, content, timestamps, user ID, global username, and server display name
- **Backfill**: on startup, the bot imports up to `GUESS_WHO_BACKFILL_LIMIT` accessible recent messages so the game has data immediately after deployment
- **Game flow**: the bot posts a polished quote embed, players guess by mentioning the author, and the same embed updates the remaining guess count
- **Reveal**: after a correct guess, 3 wrong guesses, or a 10-minute timeout, the same embed reveals the author, relative message age, original message ID, and jump link
- **Archive retention**: archived messages are kept indefinitely for DBA-side history/log retrieval; there is no Discord-facing archive search command

## Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **Bot framework**: [Sapphire Framework](https://www.sapphirejs.org/) v5 on Discord.js v14
- **Database**: PostgreSQL via Drizzle ORM
- **Cache/Queue**: Valkey (Redis-compatible) via BullMQ
- **Music**: discord-player v7
- **AI**: opencode Zen for responders and summaries only when configured and explicitly allowed for Discord content; local Ollama infra is switched off (`LOCAL_LLM_ENABLED = false` in `src/lib/features.ts`)

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Valkey or Redis

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
DISCORD_CLIENT_ID=your_client_id
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bhayanakbot
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bhayanakbot_test
VALKEY_URL=redis://localhost:6379
POSTGRES_PASSWORD=postgres
OLLAMA_URL=http://localhost:11434   # currently unused — local LLM infra disabled in src/lib/features.ts
OLLAMA_MODEL=phi3:mini              # currently unused — local LLM infra disabled in src/lib/features.ts
OLLAMA_DEBUG_CONTENT_LOGS=false     # only true for local debugging; logs raw prompts/responses
OLLAMA_MAX_QUEUE_LENGTH=25
OLLAMA_MAX_LOW_PRIORITY_QUEUE_LENGTH=10
OLLAMA_QUEUE_WAIT_TIMEOUT_MS=60000
ZEN_API_KEY=your_opencode_zen_key   # required for AI responders and summaries; requires ZEN_ALLOW_DISCORD_CONTENT=true before Discord content is sent to Zen
ZEN_ALLOW_DISCORD_CONTENT=false      # must be true for responder/summary AI replies (no local fallback)
ZEN_BASE_URL=https://opencode.ai/zen/go/v1
ZEN_MODEL=deepseek-v4-flash
ZEN_TIMEOUT_MS=15000
WEB_PORT=3000
PUBLIC_BOT_INVITE_URL=https://discord.com/oauth2/authorize
PUBLIC_STATS_INTERVAL_MS=300000
NODE_ENV=development
TARGET_GUILD_ID=199168135935295488
TARGET_TEXT_CHANNEL_ID=199168135935295488
GUESS_WHO_CHANNEL_ID=199168135935295488
GUESS_WHO_BACKFILL_LIMIT=1000
BOT_OWNER_ID=                         # optional privileged Discord user ID; blank disables owner bypasses
PALWORLD_API_URL=                     # optional; defaults to http://127.0.0.1:8212. Required under Docker
PALWORLD_ADMIN_KEY=                   # optional; Palworld AdminPassword — tracker runs once this is set
YOUTUBE_COOKIE=
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

The included `docker-compose.yml` runs everything (Postgres, Valkey, Ollama, bot, and web). The bot container runs migrations before startup:

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
