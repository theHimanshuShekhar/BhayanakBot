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
| **AI Personality** | `/personality` |
| **Voice Responder** | `/voice-responder` |

### RPG System

The RPG is an economy and progression system:

- **Stats**: Strength, Agility, Intelligence, Charisma — trained with `/train`, influence job success rates
- **Jobs**: Work (fishing, construction, delivery, mining, programmer, lawyer, doctor) and Crime (pickpocket, rob player, rob bank)
- **Items**: Tools unlock jobs or improve success rates, consumables (Lucky Charm, Energy Drink, Jail Key) provide temporary boosts. Bought via `/shop` or dropped from jobs
- **Jail**: Failing a crime sends you to jail. Bail out for coins or attempt escape with an agility roll
- **Pets**: Adopt companions (common → legendary rarity) via `/pet adopt`, rename with `/pet rename`
- **Properties**: Buy housing and businesses via `/property buy`, collect passive coin income with `/property collect`
- **AI flavor text**: Job/crime outcomes get narrated by a local Ollama instance (`gemma4:e2b` by default), with hand-written fallbacks if Ollama is unavailable

### AI Personality System

The bot builds personality profiles from server conversation to generate contextual responses:

- **User Profiles**: Per-user personality profiles built from message history (100 messages → rebuild). View with `/personality`
- **Guild Profiles**: Server-wide cultural profiles built from aggregate message data (200 messages → rebuild)
- **Smart Mentions**: When @mentioned, the bot uses personality context + conversation history for contextual replies
- **Random Responder**: Configurable chance-based responses in a designated channel, using guild personality for tone
- **Privacy**: All profiling is opt-out via `/config set personality-profiling false`. Messages older than 30 days are purged automatically

## Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **Bot framework**: [Sapphire Framework](https://www.sapphirejs.org/) v5 on Discord.js v14
- **Database**: PostgreSQL via Drizzle ORM
- **Cache/Queue**: Valkey (Redis-compatible) via BullMQ
- **Music**: discord-player v7
- **AI**: Ollama (local LLM, optional)
- **Voice STT**: whisper.cpp (self-hosted, optional)
- **Voice TTS**: Piper (self-hosted, optional)

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Valkey or Redis
- Ollama (optional — bot works without it)
- whisper.cpp (optional — for voice STT)
- Piper (optional — for voice TTS)

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
OLLAMA_MODEL=gemma4:e2b             # optional
NODE_ENV=development

# Voice responder (optional)
WHISPER_BINARY=whisper-cli
WHISPER_MODEL=ggml-base.en.bin
PIPER_BINARY=piper
PIPER_MODEL=en_US-lessac-medium.onnx
```

#### Voice Responder Setup (Optional)

The bot can join voice channels, listen to conversation, and respond with generated speech. This requires two self-hosted services:

**1. whisper.cpp (STT)**

```bash
# Clone and build
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make

# Download a model (base.en is ~75MB, runs fast on CPU)
bash models/download-ggml-model.sh base.en

# The binary is at ./main or ./build/bin/whisper-cli depending on version
# Set WHISPER_BINARY and WHISPER_MODEL in your .env
```

**2. Piper (TTS)**

```bash
# Download prebuilt binary from https://github.com/rhasspy/piper/releases
# Also download a voice model, e.g.:
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx

# Set PIPER_BINARY and PIPER_MODEL in your .env
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
