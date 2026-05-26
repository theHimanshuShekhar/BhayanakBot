# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev            # Run the bot with tsx watch (hot reload)
pnpm build          # Compile TypeScript bot source to dist/
pnpm start          # Run compiled bot output
pnpm lint           # Biome lint
pnpm format         # Biome format (writes)
pnpm check          # Biome lint + format (writes)

pnpm test           # Run Vitest tests
pnpm test:watch     # Run Vitest in watch mode
pnpm test:coverage  # Run Vitest with coverage

pnpm db:push        # Push schema changes directly (dev)
pnpm db:generate    # Generate migration files
pnpm db:migrate     # Run migrations
pnpm db:studio      # Open Drizzle Studio UI

pnpm web:dev        # Run the web frontend with Vite
pnpm web:build      # Build the web frontend to web/dist/
```

Vitest tests live under `tests/`. `tests/setup/globalSetup.ts` points `DATABASE_URL` at `TEST_DATABASE_URL` or `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test`, then runs migrations if that database is reachable. Integration tests may fail if the test Postgres database is not running.

## Architecture

**Framework**: [Sapphire Framework](https://www.sapphirejs.org/) on Discord.js v14. Sapphire auto-discovers and loads all stores from their directories. Manual registration is not needed for standard stores.

**Stores and their directories**:
| Store | Directory | Base class |
|---|---|---|
| Commands | `src/commands/<category>/` | `Command` / `Subcommand` |
| Listeners | `src/listeners/<category>/` | `Listener` |
| Interaction handlers | `src/interaction-handlers/` | `InteractionHandler` |
| Preconditions | `src/preconditions/` | `AllFlowsPrecondition` |
| Scheduled tasks | `src/scheduled-tasks/` | `ScheduledTask` |

**Client** (`src/lib/BhayanakClient.ts`): Extends `SapphireClient`. Adds `player` (discord-player), bounded in-memory caches for snipe/edit-snipe data, anti-raid join tracking, user personality profiles, and guild personality profiles. It also installs a custom Sapphire loader strategy so `tsx` development can load `.ts`, `.cts`, and `.mts` pieces.

**Entry point** (`src/index.ts`): Loads dotenv and Sapphire plugins, ensures/pulls the Ollama model, warms the model, loads discord-player extractors plus `discord-player-youtubei`, registers music player events, logs in, starts scheduled tasks, and installs shutdown/process error handlers.

**Database** (`src/lib/database.ts`): Drizzle ORM over a `pg` connection pool. Schema is in `src/db/schema.ts`. Query helpers live in `src/db/queries/` and are grouped per feature:

- `guildSettings.ts` — per-guild config for channels, roles, XP, auto-mod, anti-raid, personality, and random responses.
- `archivedChannelMessages.ts` — durable archive of non-bot messages from the Guess Who channel, with edit/delete tracking and filtered random selection for `/guess_who`.
- `rpg.ts` — profiles, stats, XP, coins, jail, cooldowns, inventory, pets, properties, daily rewards, daily quests, and quest progress.
- `modCases.ts` — auto-incrementing per-guild case numbers, mutes/tempbans with `expiresAt` and `active` flags.
- `personality.ts` and `guildPersonality.ts` — stored messages and generated user/guild personality profiles.
- `autoResponses.ts` — static and LLM auto-responses with matching, regex, channel filters, mention requirements, chance, and trigger deletion.
- `users.ts`, `roles.ts`, `tickets.ts`, `polls.ts`, `giveaways.ts`, `reminders.ts`, `suggestions.ts`, `afk.ts` — feature-specific persistence helpers.

**Major command areas**:

- RPG: `/profile`, `/train`, `/work`, `/crime`, `/shop`, `/inventory`, `/pet`, `/property`, `/daily`, `/quests`.
- Moderation: `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history`.
- Music: `/play`, `/controls`, `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop`.
- Utility: `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind`, `/help`, `/summarize`, `/personality`.
- Games: `/guess_who`.
- Server systems: `/config`, `/ticket-panel`, `/ticket`, `/suggest`, `/suggestion`, `/autorespond`, `/reaction-roles`, `/role-menu`, `/giveaway`, `/poll`.
- Minecraft: `/minecraft` shows `mc.bhayanak.net` status, Homestead version, live map link, required mods, and recommended mods.

**Scheduled tasks**: Tasks are declared as `ScheduledTask` classes but scheduled manually in `src/index.ts`. Startup runs `expireMutes`, `expireTempBans`, `sendReminders`, `endGiveaways`, `endPolls`, `reloadOnRestart`, `generateDailyQuests`, and `refreshPersonalityProfiles` once in a non-blocking cold-start pass. Runtime intervals run moderation/reminder/poll/giveaway tasks every 30 seconds, refresh personality profiles every 6 hours, and check daily quest generation every hour.

**Music**: `discord-player` v7 with `DefaultExtractors` and `discord-player-youtubei`. Music event wiring is in `src/lib/music/events.ts`; embeds/components/errors/cache helpers are under `src/lib/music/`. Music commands are gated by `IsDJ` where appropriate. `YOUTUBE_COOKIE` may be passed to the YouTube extractor.

**Help system**: `/help` is backed by `src/lib/help/collect.ts`, `render.ts`, `categories.ts`, and interaction handlers for select menus/buttons. Command help metadata is stored on command constructors via `help` objects.

## Web Frontend

The `web/` directory is a separate React frontend built with Vite, React 19, Tailwind CSS v4, and TanStack Router.

- Source lives in `web/src/`.
- Routes live in `web/src/routes/`.
- Generated route tree is `web/src/routeTree.gen.ts`.
- Command catalog data is in `web/src/data/commands.ts`.
- Components live in `web/src/components/`.
- `pnpm web:dev` runs Vite with `web/vite.config.ts`.
- `pnpm web:build` outputs to `web/dist/`.

The web app is not included in the bot TypeScript build because the root `tsconfig.json` only includes `src/**/*`.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | required | Bot token |
| `DISCORD_CLIENT_ID` | optional | Discord application/client ID |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot` | Postgres connection |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test` | Vitest integration DB |
| `VALKEY_URL` | `redis://localhost:6379` | Valkey/Redis for Sapphire scheduled-task BullMQ backing |
| `OLLAMA_URL` | `http://localhost:11434` | Local Ollama instance |
| `OLLAMA_MODEL` | `phi3:mini` | Model used for LLM features |
| `YOUTUBE_COOKIE` | unset | Optional cookie for `discord-player-youtubei` |
| `NODE_ENV` | unset | Controls log level (`debug` outside production, `info` in production) |
| `TARGET_GUILD_ID` | `199168135935295488` | Guild gate for some LLM/voice features |
| `TARGET_TEXT_CHANNEL_ID` | `199168135935295488` | Text-channel gate for personality/random response features |
| `GUESS_WHO_CHANNEL_ID` | `199168135935295488` | Channel whose messages are archived and where `/guess_who` can run |
| `GUESS_WHO_BACKFILL_LIMIT` | `1000` | Maximum Discord messages scanned during startup backfill for Guess Who archive |
| `BOT_OWNER_ID` | `199168135935295488` | Bot owner ID |

## Guess Who Message Archive

`/guess_who` uses a dedicated Postgres archive instead of the personality `user_messages` table. The archive stores non-bot messages from `GUESS_WHO_CHANNEL_ID` with original Discord message ID, guild/channel ID, author user ID, global username, server display name, content, Discord message timestamp, archive/update timestamps, and nullable edit/delete timestamps.

Startup runs `backfillGuessWhoMessages()` after `clientReady` to scan up to `GUESS_WHO_BACKFILL_LIMIT` accessible messages and upsert them by original Discord message ID. Live `messageCreate`, `messageUpdate`, and `messageDelete` listeners keep the archive current. Deleted messages stay in the archive for DBA-side history but are excluded from the game pool.

Game-eligible messages are filtered more strictly than archived messages: deleted rows, too-short/too-long content, command-like content, link-only content, mass mentions, messages from the invoker, and messages newer than one hour are excluded. Active `/guess_who` rounds are in-memory only, one per channel, with 3 wrong guesses total and a 10-minute timeout. The game edits the same embed as guesses are spent and reveals the author, relative age, message ID, and source jump link in that embed.

## RPG Module

`src/lib/rpg/` is split into two layers:

**Catalogs** — static data, no DB access:
- `jobs.ts` — work/crime jobs with `payRange`, `cooldownMs`, `baseSuccessChance`, `dropTable`, and `jailSentenceMs`.
- `items.ts` — shop items including tools, consumables, and boosts.
- `pets.ts` — pet catalog with `price`, `rarity`, and bonus stat modifiers.
- `properties.ts` — property catalog with `price` and `incomePerHour`.
- `questTemplates.ts` — templates used by daily quest generation.

**Helpers** — logic:
- `outcome.ts` — `rollOutcome()`: stat bonus = `(stat - 50) * 0.003` per relevant stat, capped 5%-70%.
- `cooldown.ts` — `getRemainingCooldown()` and `formatDuration()` wrappers over DB cooldown queries.
- `rewards.ts` — `applyJobRewards()`: pays coins and resolves drop table rolls.
- `flavorText.ts` — Ollama-generated narrative with per-job fallback pools.

**XP formula**: `level = floor(0.05 * sqrt(xp))` for RPG profiles, implemented in `addXpToProfile()`.

**Daily rewards and quests**: `/daily` uses profile `dailyStreak` and `lastDailyAt`. `/quests` displays per-guild daily quests generated by `generateDailyQuests` and tracked through `questProgress`.

## AI, Personality, And Auto-Responses

`src/lib/ollama.ts` centralizes LLM calls. On startup, `ensureOllamaModel()` pulls the configured model and `src/index.ts` sends a warmup request. Generation calls are serialized through an in-memory queue because a local Ollama instance can struggle with concurrent requests. User-facing calls use high priority; background profile builds use `callOllamaLowPriority()`.

Personality profiling stores meaningful messages only from `TARGET_TEXT_CHANNEL_ID` when per-guild `personalityEnabled` is true. User profile builds trigger after 100 new user messages. Guild profile builds trigger after 200 new guild messages. The scheduled refresh task also rebuilds stale profiles.

Mention and random responses are primarily handled in `src/listeners/messages/messageCreate.ts` so they can use stored conversation history, user personality context, and guild personality context. `src/listeners/messages/mentionResponder.ts` is a fallback path when personality profiling is disabled. `src/listeners/messages/randomResponder.ts` is an older direct target-channel random responder; account for possible overlap before changing random-response behavior.

Auto-responses can be static or LLM-backed. Matching supports exact/contains/startsWith, optional regex, channel filters, mention requirements, chance percentage, trigger deletion, and captured variable substitution.

## Interaction Handlers

`customId` uses `:` as a delimiter. Convention: `<prefix>:<action>[:<page>]`. Examples:

- `rpgshop:next:0` / `rpgshop:prev:0` — paginated shop with category index.
- `rpgjail:bail` / `rpgjail:escape` — jail action buttons.
- `rpginv:next` / `rpginv:prev` — inventory pagination.

The `parse()` method usually uses `startsWith("<prefix>:")` to claim interactions.

Current handlers include ticket buttons, RPG jail actions, RPG shop pagination, music buttons, role menu select, poll votes, giveaway entry, and help menu/buttons.

## Preconditions

Available preconditions to use in command constructors: `GuildOnly`, `IsModerator`, `IsAdmin`, `IsDJ`, `TicketChannel`. Moderator/Admin/DJ roles are resolved from `guildSettings` in the DB, falling back to Discord permission flags.

## Listeners And Auto-Mod

Primary message flow is in `src/listeners/messages/messageCreate.ts`. It handles conversation history, personality message storage, AFK clear/notifications, auto-mod, XP, auto-responses, smart mention replies, and configured random contextual responses.

Auto-mod uses an inline spam tracker: a `Map<"guildId:userId", { count, resetAt }>` with a 5-second window. Threshold is configurable per guild. Violations can warn, mute, or kick and create mod cases. Bad-link and mass-mention checks are also configurable.

Guild listeners cover joins/leaves and audit log entries. Reaction listeners support reaction roles. Message delete/update listeners support snipe/edit-snipe behavior. Voice listeners support music queue cleanup when the bot is disconnected or left alone.

## Code Style

Biome enforces tabs (width 2), double quotes, trailing commas, semicolons, and 120-character line width. Run `pnpm check` before committing.

All local imports use `.js` extensions for ESM resolution, even when importing `.ts` source files.

Root TypeScript uses `module` and `moduleResolution` set to `NodeNext`, strict mode, decorators enabled, declarations/source maps, and the `#/*` path alias for `src/*`. Vitest also maps `#` to `src`.

New `pgEnum` values in the Drizzle schema require a new migration (`pnpm db:generate` + `pnpm db:migrate`) because `db:push` can silently skip enum changes.

## Testing

Tests are split into unit, integration, and smoke coverage:

- `tests/unit/catalog/` verifies RPG catalogs.
- `tests/unit/rpg/` verifies RPG helpers.
- `tests/unit/*/structure.test.ts` verifies Sapphire piece structure.
- `tests/integration/db/` verifies DB query behavior and needs a reachable test Postgres database.
- `tests/smoke/build.test.ts` runs `npx tsc --noEmit` and imports `BhayanakClient`.

Use `pnpm test` for the full suite and expect DB-backed tests to depend on `TEST_DATABASE_URL` availability.

## Deployment

`docker-compose.yml` runs Postgres, Valkey, Ollama, and the bot on the `botnet` bridge network. The current compose file does not define a separate migration service; the production bot container runs `pnpm db:migrate && pnpm exec tsx src/index.ts` as its command.

The `Dockerfile` has multiple stages:

- `base` installs full dependencies and copies source/config.
- `migration` is a small image target that can run `drizzle-kit migrate` if used separately.
- `production` is Debian-based, installs runtime dependencies, copies source, and runs the bot through `tsx`.

Compose injects service hostnames for `DATABASE_URL`, `VALKEY_URL`, and `OLLAMA_URL`, so local `.env` values are mainly for non-Docker development.
