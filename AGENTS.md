# Repository Notes

## Commands

```bash
pnpm dev            # Run the bot with tsx watch
pnpm build          # Compile TypeScript bot source to dist/
pnpm start          # Run compiled bot output
pnpm lint           # Biome lint
pnpm format         # Biome format --write
pnpm check          # Biome check --write

pnpm test           # Run Vitest tests
pnpm test:watch     # Run Vitest in watch mode
pnpm test:coverage  # Run Vitest with coverage

pnpm db:push        # Push schema changes directly in dev
pnpm db:generate    # Generate migration files
pnpm db:migrate     # Run migrations
pnpm db:studio      # Open Drizzle Studio UI

pnpm web:dev        # Run the Astro web frontend
pnpm web:build      # Build the Astro web frontend to web/dist/
pnpm web:preview    # Preview the built Astro frontend
```

Vitest tests live under `tests/`. `tests/setup/globalSetup.ts` points `DATABASE_URL` at `TEST_DATABASE_URL` or `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test`, then runs migrations if that database is reachable. Integration tests may fail if the test Postgres database is not running.

## Architecture

**Framework:** Sapphire Framework on Discord.js v14. Sapphire auto-discovers and loads stores from their directories; manual registration is not needed for standard stores.

**Stores:**

| Store | Directory | Base class |
|---|---|---|
| Commands | `src/commands/<category>/` | `Command` / `Subcommand` |
| Listeners | `src/listeners/<category>/` | `Listener` |
| Interaction handlers | `src/interaction-handlers/` | `InteractionHandler` |
| Preconditions | `src/preconditions/` | `AllFlowsPrecondition` |
| Scheduled tasks | `src/scheduled-tasks/` | `ScheduledTask` |

**Client:** `src/lib/BhayanakClient.ts` extends `SapphireClient`. It adds `player`, bounded in-memory caches for snipe/edit-snipe data, anti-raid join tracking, user personality profiles, and guild personality profiles. It installs a custom Sapphire loader strategy so `tsx` development can load `.ts`, `.cts`, and `.mts` pieces.

**Entry point:** `src/index.ts` loads dotenv and Sapphire plugins, ensures/pulls the Ollama model, warms the model, loads discord-player extractors plus `discord-player-youtubei`, registers music player events, logs in, starts scheduled tasks, and installs shutdown/process error handlers.

**Database:** `src/lib/database.ts` uses Drizzle ORM over a `pg` connection pool. Schema is in `src/db/schema.ts`; query helpers live in `src/db/queries/`.

Key query helpers:

- `guildSettings.ts` — per-guild config for channels, roles, XP, auto-mod, anti-raid, personality, and random responses.
- `archivedChannelMessages.ts` — durable archive of non-bot messages from the Guess Who channel, with edit/delete tracking and filtered random selection for `/guess_who`.
- `personalityTraining.ts` — archive-backed personality training eligibility and cursor-window queries.
- `personality.ts` and `guildPersonality.ts` — generated user/guild personality profile storage and lookup helpers.
- `rpg.ts` — profiles, stats, XP, coins, jail, cooldowns, inventory, pets, properties, daily rewards, daily quests, and quest progress.
- `modCases.ts` — auto-incrementing per-guild case numbers, mutes/tempbans with `expiresAt` and `active` flags.
- `autoResponses.ts` — static and LLM auto-responses with matching, regex, channel filters, mention requirements, chance, and trigger deletion.
- `users.ts`, `roles.ts`, `tickets.ts`, `polls.ts`, `giveaways.ts`, `reminders.ts`, `suggestions.ts`, `afk.ts` — feature-specific persistence helpers.

## Commands And Web Docs

Major Discord command areas:

- RPG: `/profile`, `/train`, `/work`, `/crime`, `/shop`, `/inventory`, `/pet`, `/property`, `/daily`, `/quests`.
- Leveling: `/rank`, `/leaderboard`, `/rewards`, `/level-reset`.
- Moderation: `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history`.
- Music: `/play`, `/controls`, `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop`.
- Utility: `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind`, `/help`, `/summarize`, `/personality`.
- Fun and games: `/8ball`, `/coinflip`, `/choose`, `/meme`, `/poll`, `/guess_who`.
- Server systems: `/config`, `/ticket-panel`, `/ticket`, `/suggest`, `/suggestion`, `/autorespond`, `/reaction-roles`, `/role-menu`, `/giveaway`.
- Minecraft: `/minecraft` shows `mc.bhayanak.net` status, Homestead version, live map link, required mods, and recommended mods.

When any Discord command is added, deleted, renamed, or behaviorally modified, update the web app command catalog and any relevant command documentation in `web/src/data/commands.ts` and `web/src/content/commands/` in the same change.

## Web Frontend

The `web/` directory is an Astro site built with MDX content collections and Tailwind CSS v4.

- Source lives in `web/src/`.
- Pages live in `web/src/pages/`.
- Command catalog data is in `web/src/data/commands.ts`.
- Rich command detail docs live in `web/src/content/commands/`.
- Components live in `web/src/components/`.
- `pnpm web:dev` runs Astro with `web/astro.config.mjs`.
- `pnpm web:build` outputs to `web/dist/`.

The web app is not included in the bot TypeScript build because root `tsconfig.json` only includes `src/**/*`.

## Environment Variables

Keep `.env.example`, `README.md`, Docker Compose, and this table in sync when environment variables change.

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | required | Bot token |
| `DISCORD_CLIENT_ID` | optional | Discord application/client ID |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot` | Postgres connection |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test` | Vitest integration DB |
| `VALKEY_URL` | `redis://localhost:6379` | Valkey/Redis for Sapphire scheduled-task BullMQ backing |
| `POSTGRES_PASSWORD` | `postgres` | Docker Postgres password |
| `OLLAMA_URL` | `http://localhost:11434` | Local Ollama instance |
| `OLLAMA_MODEL` | `phi3:mini` | Model used by local Ollama features and fallback paths |
| `ZEN_API_KEY` | unset | opencode Zen API key; responder, summary, and personality generation use Zen first when set |
| `ZEN_BASE_URL` | `https://opencode.ai/zen/go/v1` | OpenAI-compatible Zen API base URL |
| `ZEN_MODEL` | `deepseek-v4-flash` | Zen model for autoresponder, summaries, and user/guild personality generation |
| `WEB_PORT` | `3000` in `.env.example`, `4321` Compose fallback | Host port for the web service |
| `PUBLIC_BOT_INVITE_URL` | Discord OAuth URL | Public invite link shown by the web app |
| `PUBLIC_STATS_INTERVAL_MS` | `300000` | Bot stats snapshot refresh interval |
| `YOUTUBE_COOKIE` | unset | Optional cookie for `discord-player-youtubei` |
| `NODE_ENV` | unset | Controls log level (`debug` outside production, `info` in production) |
| `TARGET_GUILD_ID` | `199168135935295488` | Guild gate for some LLM features |
| `TARGET_TEXT_CHANNEL_ID` | `199168135935295488` | Text-channel gate for responder features |
| `GUESS_WHO_CHANNEL_ID` | `199168135935295488` | Channel whose messages are archived and where `/guess_who` can run |
| `GUESS_WHO_BACKFILL_LIMIT` | `1000` | Maximum Discord messages scanned during startup backfill for Guess Who archive |
| `BOT_OWNER_ID` | `199168135935295488` | Bot owner ID |

## Message Archive And Personality

`/guess_who` and personality training use the durable `archived_channel_messages` table as source material. The archive stores non-bot messages from `GUESS_WHO_CHANNEL_ID` with original Discord message ID, guild/channel ID, author user ID, global username, server display name, content, Discord message timestamp, archive/update timestamps, and nullable edit/delete timestamps.

Startup runs `backfillGuessWhoMessages()` after `clientReady` to scan up to `GUESS_WHO_BACKFILL_LIMIT` accessible messages and upsert them by original Discord message ID. Live `messageCreate`, `messageUpdate`, and `messageDelete` listeners keep the archive current. Deleted messages stay in the archive for DBA-side history but are excluded from future game and personality training queries.

Personality profile builders read eligible archived messages in bounded cursor windows. User profile creation needs 100 eligible messages; later refreshes need 20. Guild culture profile creation needs 200 eligible messages; later refreshes need 40. Profiles must not quote source messages directly.

`personalityEnabled` is a guild admin operational toggle, not consent or opt-in/opt-out language. Normal AI replies may use personality context silently; `/personality view user` and `/personality view guild` are the explicit inspection surfaces. `/personality refresh user` and `/personality refresh guild` run admin-only incremental refreshes.

Responder, summarize, and personality LLM calls use `src/lib/llmProvider.ts`: Zen first when configured, then local Ollama fallback. RPG flavor and quest generation remain local-Ollama features.

## RPG Module

`src/lib/rpg/` is split into catalogs and helpers.

Catalogs have static data and no DB access:

- `jobs.ts` — work/crime jobs with `payRange`, `cooldownMs`, `baseSuccessChance`, `dropTable`, and `jailSentenceMs`.
- `items.ts` — shop items including tools, consumables, and boosts.
- `pets.ts` — pet catalog with `price`, `rarity`, and bonus stat modifiers.
- `properties.ts` — property catalog with `price` and `incomePerHour`.
- `questTemplates.ts` — templates used by daily quest generation.

Helpers contain logic:

- `outcome.ts` — `rollOutcome()`: stat bonus = `(stat - 50) * 0.003` per relevant stat, capped 5%-70%.
- `cooldown.ts` — `getRemainingCooldown()` and `formatDuration()` wrappers over DB cooldown queries.
- `rewards.ts` — `applyJobRewards()`: pays coins and resolves drop table rolls.
- `flavorText.ts` — local-Ollama narrative generation with fallback pools.

XP formula: `level = floor(0.05 * sqrt(xp))` for RPG profiles, implemented in `addXpToProfile()`.

## Scheduled Tasks

Scheduled tasks are declared as `ScheduledTask` classes but scheduled manually in `src/index.ts`. Startup runs `expireMutes`, `expireTempBans`, `sendReminders`, `endGiveaways`, `endPolls`, `reloadOnRestart`, `generateDailyQuests`, and `refreshPersonalityProfiles` once in a non-blocking cold-start pass. Runtime intervals run moderation/reminder/poll/giveaway tasks every 30 seconds, refresh personality profiles every 6 hours, and check daily quest generation every hour.

## Music

Music uses `discord-player` v7 with `DefaultExtractors` and `discord-player-youtubei`. Event wiring is in `src/lib/music/events.ts`; embeds/components/errors/cache helpers are under `src/lib/music/`. Music commands are gated by `IsDJ` where appropriate. `YOUTUBE_COOKIE` may be passed to the YouTube extractor.

## Interaction Handlers

`customId` uses `:` as a delimiter. Convention: `<prefix>:<action>[:<page>]`. The `parse()` method usually uses `startsWith("<prefix>:")` to claim interactions.

Current handlers include ticket buttons, RPG jail actions, RPG shop pagination, music buttons, role menu select, poll votes, giveaway entry, and help menu/buttons.

## Preconditions

Available preconditions in command constructors: `GuildOnly`, `IsModerator`, `IsAdmin`, `IsDJ`, `TicketChannel`. Moderator/Admin/DJ roles resolve from `guildSettings`, falling back to Discord permission flags.

## Code Style

Biome enforces tabs, double quotes, trailing commas, semicolons, and 120-character line width. Run `pnpm check` before committing when code or formatted docs change.

All local imports use `.js` extensions for ESM resolution, even when importing `.ts` source files.

Root TypeScript uses `module` and `moduleResolution` set to `NodeNext`, strict mode, decorators enabled, declarations/source maps, and the `#/*` path alias for `src/*`. Vitest also maps `#` to `src`.

New `pgEnum` values in Drizzle schema require a migration (`pnpm db:generate` + `pnpm db:migrate`) because `db:push` can silently skip enum changes.

## Testing

Use `pnpm test` for the full suite. DB-backed tests need a reachable test Postgres database.

Real-Ollama personality e2e coverage is opt-in with `RUN_OLLAMA_E2E=1 pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts`; default runs skip it when not opted in.

## Deployment

`docker-compose.yml` runs Postgres, Valkey, Ollama, the bot, and the Astro web server on the `botnet` bridge network. The production bot container runs `pnpm db:migrate && pnpm exec tsx src/index.ts` as its command.

The `Dockerfile` has these stages:

- `base` installs full dependencies and copies source/config.
- `migration` is a small image target that can run `drizzle-kit migrate` if used separately.
- `production` is Debian-based, installs runtime dependencies, copies source, and runs the bot through `tsx`.

Compose injects service hostnames for `DATABASE_URL`, `VALKEY_URL`, and `OLLAMA_URL`, so local `.env` values are mainly for non-Docker development.
