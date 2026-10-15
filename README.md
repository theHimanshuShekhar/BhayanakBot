# BhayanakBot

A fully custom Discord bot built for the Bhayanak server. Features a moderation suite, music playback, leveling system, archive-backed games and personality, giveaways, polls, and more.

## Features

| Category | Commands |
|---|---|
| **Moderation** | `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history` |
| **Music** | `/play`, `/controls`, `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop` |
| **Leveling** | `/rank`, `/leaderboard`, `/rewards`, `/level-reset` |
| **Utility** | `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind`, `/help`, `/summarize`, `/personality` |
| **Fun** | `/8ball`, `/coinflip`, `/choose`, `/meme`, `/poll` |
| **Games** | `/guess_who` |
| **Giveaways** | `/giveaway` |
| **Auto-respond** | `/autorespond` |
| **Config** | `/config` |
| **Minecraft** | `/minecraft` |

`/summarize`, `/personality`, `/guess_who`, and the AI replies below are Home-Server Features: they run only in the guild named by `TARGET_GUILD_ID` (the Bhayanak server). The three commands are registered as guild commands there and are invisible elsewhere, and mentioning the bot in any other guild sends nothing to Zen and gets no AI reply. Everything else works in every guild.

### AI Personality System

The bot can build personality profiles from archived server conversation to generate contextual responses. Profile generation is currently disabled (`PERSONALITY_GENERATION_ENABLED = false` in `src/lib/features.ts`) — profiles reflect previously generated data only.

- **User Profiles**: Per-user personality profiles built from eligible archived messages. View with `/personality view user`
- **Guild Profiles**: Server culture profiles built from eligible archived messages. View with `/personality view guild`
- **Generation disabled**: startup backfill builds, the 6-hour refresh task, and `/personality refresh` subcommands are inactive until re-enabled
- **Smart Mentions**: When @mentioned, the bot uses personality context + conversation history for contextual replies
- **Random Responder**: Chance-based responses in the configured random-response channel (`/config`), with a 45-second per-channel cooldown; a message gets at most one AI reply
- **Operational Toggle**: Server admins can enable or disable personality behavior with `/config`; this is not consent or opt-in/opt-out language

### Guess Who Game

`/guess_who` is a channel-based guessing game backed by a durable Postgres message archive:

- **Archive source**: non-bot messages from `GUESS_WHO_CHANNEL_ID` are archived with the Discord message ID, content, timestamps, user ID, global username, and server display name
- **Backfill**: on startup, the bot imports up to `GUESS_WHO_BACKFILL_LIMIT` accessible recent messages so the game has data immediately after deployment
- **Live messages only**: before a round shows a message the bot confirms it still exists on Discord; deleted messages (including bulk deletes such as `/purge`) are marked deleted in the archive and never used
- **Game flow**: the bot posts a polished quote embed, players guess by typing a mention of the author (a reply ping alone does not count), and the same embed updates the remaining guess count
- **Reveal**: after a correct guess, 3 wrong guesses, or a 10-minute timeout, the same embed reveals the author, relative message age, original message ID, and jump link
- **Archive retention**: archived messages are kept indefinitely for DBA-side history/log retrieval; there is no Discord-facing archive search command

## Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **Bot framework**: [Sapphire Framework](https://www.sapphirejs.org/) v5 on Discord.js v14
- **Database**: PostgreSQL via Drizzle ORM
- **Background tasks**: in-process timers (no queue or cache service)
- **Music**: discord-player v7
- **AI**: opencode Zen is the only LLM provider, used for responders and summaries only when configured and explicitly allowed for Discord content; otherwise AI features stay silent

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL

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
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bhayanakbot_test
POSTGRES_PASSWORD=postgres
ZEN_API_KEY=your_opencode_zen_key   # required for AI responders and summaries; requires ZEN_ALLOW_DISCORD_CONTENT=true before Discord content is sent to Zen
ZEN_ALLOW_DISCORD_CONTENT=false      # must be true for responder/summary AI replies (no local fallback)
ZEN_BASE_URL=https://opencode.ai/zen/go/v1
ZEN_MODEL=deepseek-v4-flash
ZEN_TIMEOUT_MS=30000
WEB_PORT=3000
PUBLIC_BOT_INVITE_URL=https://discord.com/oauth2/authorize
PUBLIC_STATS_INTERVAL_MS=300000
DASHBOARD_PRESENCE_INTERVAL_MS=60000
DASHBOARD_API_TOKEN=                  # bearer token for /api/dashboard-presence; blank leaves it open (local dev only)
NODE_ENV=development
TARGET_GUILD_ID=199168135935295488
TARGET_TEXT_CHANNEL_ID=199168135935295488
GUESS_WHO_CHANNEL_ID=199168135935295488
GUESS_WHO_BACKFILL_LIMIT=1000
BOT_OWNER_ID=                         # optional privileged Discord user ID; blank disables owner bypasses
PALWORLD_API_URL=                     # optional; defaults to http://127.0.0.1:8212. Required under Docker
PALWORLD_ADMIN_KEY=                   # optional; Palworld AdminPassword — tracker runs once this is set
MINECRAFT_RCON_HOST=                  # optional; defaults to 127.0.0.1. Set when Minecraft is outside the bot container
MINECRAFT_RCON_PORT=                  # optional; defaults to 25575
MINECRAFT_RCON_PASSWORD=              # optional; enables the local Minecraft RCON tracker
YOUTUBE_COOKIE=
```
Minecraft tracking uses Java RCON. Enable `enable-rcon=true` and set `rcon.port=25575` and `rcon.password=...` in `server.properties`; set the same password in the bot's `MINECRAFT_RCON_PASSWORD` environment variable. If the bot runs in Docker while Minecraft runs on the LXC host, set `MINECRAFT_RCON_HOST` to an address reachable from the bot container.

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

The included `docker-compose.yml` runs everything (Postgres, bot, and web). The bot container runs migrations before startup:

```bash
cp .env.example .env
# Set DISCORD_TOKEN in .env
docker compose up -d
```

The service hostname (`postgres`) is injected automatically — `.env` values are only used for local development.

The web service serves the public site, so set `DASHBOARD_API_TOKEN` in the deployment's `.env`: `GET /api/dashboard-presence` (member IDs and voice state) then requires `Authorization: Bearer <DASHBOARD_API_TOKEN>` and answers 404 without it. When updating a deployment, also update the homelab Glance dashboard widget to send that header, or it will start getting 404s. Left unset, the endpoint is open and the web service logs a warning.

## Development

```bash
pnpm check      # lint + format (Biome, auto-fix)
pnpm typecheck  # TypeScript over src and tests
pnpm test       # Vitest (needs the test Postgres database)
pnpm db:push    # push schema changes without a migration (dev only)
```

Biome enforces: tabs, double quotes, trailing commas, 120-char line width.

`pnpm install` points the repository at the committed `.githooks/` directory, whose pre-commit hook runs Biome on staged files only. On a failure run `pnpm check`, re-stage, and commit again. CI (the `verify` job) additionally runs the type check, the full test suite against a Postgres service, and the web build; the Docker image is only built and pushed after `verify` passes.

When adding new Drizzle `pgEnum` values, always generate and run a migration — `db:push` skips enum changes.
