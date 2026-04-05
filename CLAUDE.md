# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Run with tsx watch (hot reload)
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled output
pnpm lint         # Biome lint
pnpm format       # Biome format (writes)
pnpm check        # Biome lint + format (writes)

pnpm db:push      # Push schema changes directly (dev)
pnpm db:generate  # Generate migration files
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Drizzle Studio UI
```

No test suite exists yet.

## Architecture

**Framework**: [Sapphire Framework](https://www.sapphirejs.org/) on Discord.js v14. Sapphire auto-discovers and loads all stores from their directories — no manual registration needed.

**Stores and their directories**:
| Store | Directory | Base class |
|---|---|---|
| Commands | `src/commands/<category>/` | `Command` |
| Listeners | `src/listeners/<category>/` | `Listener` |
| Interaction handlers | `src/interaction-handlers/` | `InteractionHandler` |
| Preconditions | `src/preconditions/` | `AllFlowsPrecondition` |
| Scheduled tasks | `src/scheduled-tasks/` | `ScheduledTask` |

**Client** (`src/lib/BhayanakClient.ts`): Extends `SapphireClient`. Adds `player` (discord-player), `snipeCache` and `editSnipeCache` (in-memory Maps keyed by channelId), and `recentJoins` (anti-raid tracking). Module augmentation extends the `SapphireClient` interface for type safety.

**Database** (`src/lib/database.ts`): Drizzle ORM over a `pg` connection pool. Schema is in `src/db/schema.ts`. Query helpers per feature live in `src/db/queries/`:
- `guildSettings.ts` — per-guild config (mod/admin/DJ roles, channel IDs, feature flags)
- `rpg.ts` — 23 helpers covering profiles, stats, XP, coins, jail, cooldowns, inventory, pets, properties
- `modCases.ts` — auto-incrementing per-guild case numbers, mutes/tempbans with `expiresAt` and `active` flags
- `users.ts`, `roles.ts`, `tickets.ts`, `polls.ts`, `giveaways.ts`, `reminders.ts`, `suggestions.ts`, `autoResponses.ts`, `afk.ts`

**Scheduled tasks**: Tasks are declared as `ScheduledTask` classes but scheduled manually in `src/index.ts` using `setInterval(..., 30_000)`. Each task also calls `.run(null)` once at startup (cold-start). This is not cron-based.

**Music**: `discord-player` v7 with `DefaultExtractors` loaded at startup. All music commands are gated by the `IsDJ` precondition. Commands in `src/commands/music/`.

**Ollama**: AI flavor text is generated via `src/lib/rpg/helpers/flavorText.ts`, which calls the local Ollama `/api/generate` endpoint with a 2-second `AbortController` timeout. On failure it falls back to per-action pools defined in the same file.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | required | Bot token |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot` | Postgres connection |
| `VALKEY_URL` | `redis://localhost:6379` | Valkey (Redis) for BullMQ |
| `OLLAMA_URL` | `http://localhost:11434` | Local Ollama instance |
| `OLLAMA_MODEL` | `tinyllama` | Model used for flavor text |
| `NODE_ENV` | — | Controls log level (debug vs info) |

## RPG module

`src/lib/rpg/` is split into two layers:

**Catalogs** — static data, no DB access:
- `jobs.ts` — work/crime jobs with `payRange`, `cooldownMs`, `baseSuccessChance`, `dropTable`, `jailSentenceMs`
- `items.ts` — shop items including consumables (e.g., `lucky_charm` grants +10% success chance)
- `pets.ts` — pet catalog with `price`, `rarity`, `bonus` stat modifiers
- `properties.ts` — property catalog with `price` and `incomePerHour`

**Helpers** — logic:
- `outcome.ts` — `rollOutcome()`: stat bonus = `(stat - 50) × 0.003` per relevant stat, capped 5%–70%
- `cooldown.ts` — `getRemainingCooldown()` / `formatDuration()` wrappers over DB cooldown queries
- `rewards.ts` — `applyJobRewards()`: pays coins and resolves drop table rolls
- `flavorText.ts` — Ollama-generated narrative with per-job fallback pools (10+ lines each outcome)

**XP formula**: `level = floor(0.05 × √xp)` — implemented in `addXpToProfile()`.

## Interaction handlers

`customId` uses `:` as a delimiter. Convention: `<prefix>:<action>[:<page>]`. Examples:
- `rpgshop:next:0` / `rpgshop:prev:0` — paginated shop with category index
- `rpgjail:bail` / `rpgjail:escape` — jail action buttons
- `rpginv:next` / `rpginv:prev` — inventory pagination

The `parse()` method uses `startsWith("<prefix>:")` to claim interactions.

## Code style

Biome enforces: tabs (width 2), double quotes, trailing commas, 120-char line width. Run `pnpm check` before committing.

All local imports use `.js` extensions (ESM resolution, even for `.ts` source files).

New `pgEnum` values in the Drizzle schema require a new migration (`pnpm db:generate` + `pnpm db:migrate`) — `db:push` will silently skip enum changes.

## Preconditions

Available preconditions to use in command constructors: `GuildOnly`, `IsModerator`, `IsAdmin`, `IsDJ`, `TicketChannel`. Moderator/Admin/DJ roles are resolved from `guildSettings` in the DB, falling back to Discord permission flags.

## Listeners and auto-mod

`messageCreate` (`src/listeners/guild/messageCreate.ts`) contains an inline spam tracker: a `Map<"guildId:userId", count>` with a 5-second window. Threshold is configurable per guild (default 5 messages). Exceeding it triggers a mute and logs a mod case.

## Deployment

`docker-compose.yml` runs: `postgres` → `migrate` (runs `pnpm db:migrate`) → `bot`, plus `valkey` and `ollama`. Service hostnames (`postgres`, `valkey`, `ollama`) are injected as environment variable overrides in compose, so `.env` values are only used locally.
