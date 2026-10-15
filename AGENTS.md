# Repository Notes

## Commands

```bash
pnpm dev            # Run the bot with tsx watch
pnpm build          # Compile TypeScript bot source to dist/
pnpm start          # Run compiled bot output
pnpm lint           # Biome lint
pnpm format         # Biome format --write
pnpm check          # Biome check --write
pnpm check:ci       # Biome in CI mode (no writes; what CI runs)
pnpm typecheck      # tsc over src (tsconfig.json), then src + tests (tsconfig.test.json)

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

**Framework:** Sapphire Framework on Discord.js v14. Sapphire auto-discovers and loads stores from their directories; manual registration is not needed for standard stores. Background tasks are not a Sapphire store; see Scheduled Tasks.

**Feature switches:** `src/lib/features.ts` holds the compile-time switch `PERSONALITY_GENERATION_ENABLED`. It is currently `false`: personality generation is inactive, though its code remains, and `refreshPersonalityProfiles` is left out of the task list in `src/tasks/index.ts`. Flip a flag and its wiring comes back.

**Stores:**

| Store | Directory | Base class |
|---|---|---|
| Commands | `src/commands/<category>/` | `Command` / `Subcommand` |
| Listeners | `src/listeners/<category>/` | `Listener` |
| Interaction handlers | `src/interaction-handlers/` | `InteractionHandler` |
| Preconditions | `src/preconditions/` | `AllFlowsPrecondition` |

**Client:** `src/lib/BhayanakClient.ts` extends `SapphireClient`. It adds `player`, bounded in-memory caches for snipe/edit-snipe data, anti-raid join tracking, user personality profiles, and guild personality profiles. It installs a custom Sapphire loader strategy so `tsx` development can load `.ts`, `.cts`, and `.mts` pieces.

**Mention Policy:** the client sets `allowedMentions` to `DEFAULT_ALLOWED_MENTIONS` (`src/lib/allowedMentions.ts`): no user/role/everyone parsing and no reply pings, so every bot message notifies nobody. A per-send `allowedMentions` replaces the default entirely, so features that must reach specific members (reminder owner, levelled-up member, giveaway winners) pass `notifyOnly([...userIds])`. Do not sanitise text instead.

**Entry point:** `src/index.ts` loads dotenv and Sapphire plugins, loads discord-player extractors plus `discord-player-youtubei`, registers music player events, logs in, starts the in-process task scheduler, and installs shutdown/process error handlers.

**Shutdown:** `src/lib/shutdown.ts` builds the one idempotent `shutdown(reason, exitCode)` used by `src/index.ts`. SIGINT/SIGTERM exit 0, an uncaught exception or startup failure exits 1 (a later non-zero code overrides an earlier zero), and an unhandled rejection is only logged. It runs these steps in order, each isolated so one failure does not block the rest: stop the task scheduler, destroy the music player, destroy the Discord client, end the database pool (`closeDatabase()`). A 10-second unref'd timer forces exit if a step hangs.

**Database:** `src/lib/database.ts` uses Drizzle ORM over a `pg` connection pool (`buildPoolConfig`): `application_name` `bhayanakbot`, 10s connection timeout, 30s idle timeout, and a 60s `statement_timeout` (generous because personality and archive queries scan large message windows). Schema is in `src/db/schema.ts`; query helpers live in `src/db/queries/`.

Key query helpers:

- `guildSettings.ts` — per-guild config for channels, roles, XP, auto-mod, anti-raid, personality, and random responses. `getOrCreateSettings` is race-safe (insert on conflict do nothing, then select) and cached for 60 seconds in `src/lib/music/guildSettingsCache.ts`, shared with the music `IsDJ` lookup; `updateSettings` invalidates. Write `guild_settings` only through `updateSettings`, and call `invalidateGuildSettings` in tests that insert or delete rows directly.
- `archivedChannelMessages.ts` — durable archive of non-bot messages from the Guess Who channel, with edit/delete tracking and filtered random selection for `/guess_who`.
- `personalityTraining.ts` — archive-backed personality training eligibility and cursor-window queries.
- `personality.ts` and `guildPersonality.ts` — generated user/guild personality profile storage and lookup helpers.
- `modCases.ts` — auto-incrementing per-guild case numbers, mutes/tempbans with `expiresAt` and `active` flags.
- `autoResponses.ts` — static and LLM auto-responses with matching, regex, channel filters, mention requirements, chance, and trigger deletion. Regex triggers run on RE2 via `re2js` (`src/lib/autoresponder/regexTrigger.ts`): no lookarounds/backreferences, 100-char patterns, first 2000 chars of input, compiled patterns cached per response id; stored patterns that fail validation never run and show as disabled in `/autorespond list`.
- `users.ts`, `polls.ts`, `giveaways.ts`, `reminders.ts`, `afk.ts` — feature-specific persistence helpers.

## Commands And Web Docs

Major Discord command areas:

- Leveling: `/rank`, `/leaderboard`, `/rewards`, `/level-reset`.
- Moderation: `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history`.
- Music: `/play`, `/music` (pause, resume, skip, stop, disconnect), `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop`.
- Utility: `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind`, `/help`, `/summarize`, `/personality`.
- Fun and games: `/8ball`, `/coinflip`, `/choose`, `/meme`, `/poll`, `/guess_who`.
- Server systems: `/config`, `/autorespond`, `/giveaway`.
- Minecraft: `/minecraft` shows `mc.bhayanak.net` status, Homestead version, live map link, required mods, and recommended mods.

`/summarize`, `/personality`, and `/guess_who` are Home-Server Features (ADR 0007): they register with `HOME_SERVER_REGISTRATION` (`guildIds: [TARGET_GUILD_ID]`) from `src/lib/homeServer.ts` and carry the `HomeServerOnly` precondition. Sapphire never deletes commands, so moving a command from global to guild registration leaves the old global one behind; `removeGlobalHomeServerCommands` (called on `clientReady`) deletes stale global copies of `HOME_SERVER_COMMAND_NAMES`. A new Home-Server command must be added to both. Passive AI paths (`mentionResponder`, `randomResponder`, `messageCreate` smart mention and random reply) gate on `isHomeServer(guildId)`. LLM-type autoresponses fire only in `TARGET_TEXT_CHANNEL_ID` (skipped, never posted as static text, elsewhere) and `/autorespond add use-llm` is refused outside the Home Server. AI replies are invisible on failure: the trigger message is deleted only once a reply is ready, and trigger/user cooldowns start only after a reply is sent. `src/lib/autoresponder/replyGuard.ts` keeps one AI reply per message (direct replies outrank random ones) and a shared 45-second per-channel cooldown for both random-reply paths (`messageCreate` and `randomResponder`), which both honour `randomResponseChannelId` and `randomResponseChance`.

`/help` (`src/lib/help/`) lists each command under the name it registered (`applicationCommandRegistry.chatInputCommands`), never the file or piece name, and files it by its `src/commands/<dir>/` directory. A new command directory needs a matching entry in `src/lib/help/categories.ts` (the `minecraft` directory is the "Game Servers" category); `tests/unit/lib/help.test.ts` fails otherwise.

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

Keep `.env.example`, `README.md`, Docker Compose (the bot service's explicit `environment:` list), and this table in sync when environment variables change. `tests/unit/config/envContract.test.ts` fails when a variable the bot reads is missing from any of them, or when this table documents a variable nothing reads. A blank value counts as unset and falls back to the default (`src/lib/env.ts`).

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | required | Bot token |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot` | Postgres connection |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test` | Vitest integration DB |
| `POSTGRES_PASSWORD` | `postgres` | Docker Postgres password; also the password in Compose's default `DATABASE_URL` for the bot and web services |
| `ZEN_API_KEY` | unset | opencode Zen API key; responder and summary replies require it (plus `ZEN_ALLOW_DISCORD_CONTENT=true`). Personality generation is disabled independently |
| `ZEN_ALLOW_DISCORD_CONTENT` | `false` | Must be `true` before Discord message content is sent to Zen; with local LLM disabled there is no other provider |
| `ZEN_BASE_URL` | `https://opencode.ai/zen/go/v1` | OpenAI-compatible Zen API base URL |
| `ZEN_MODEL` | `deepseek-v4-flash` | Zen model for autoresponder, summaries, and user/guild personality generation |
| `ZEN_TIMEOUT_MS` | `30000` | Timeout for Zen chat replies only (minimum 1000); summaries (120s) and personality builds (180s) keep their own timeouts |
| `WEB_PORT` | `3000` in `.env.example`, `4321` Compose fallback | Host port for the web service |
| `PUBLIC_BOT_INVITE_URL` | Discord OAuth URL | Public invite link shown by the web app |
| `PUBLIC_STATS_INTERVAL_MS` | `300000` | Bot stats snapshot refresh interval |
| `DASHBOARD_PRESENCE_INTERVAL_MS` | `60000` | Dashboard presence snapshot refresh interval |
| `DASHBOARD_API_TOKEN` | unset | Read by the web service (not the bot). `GET /api/dashboard-presence` requires `Authorization: Bearer <token>` and answers 404 otherwise (constant-time compare, ADR 0004 amendment). Unset leaves it open and logs a one-time warning; set it on any internet-reachable deployment |
| `YOUTUBE_COOKIE` | unset | Optional cookie for `discord-player-youtubei` |
| `NODE_ENV` | unset | Controls log level (`debug` outside production, `info` in production) |
| `TARGET_GUILD_ID` | `199168135935295488` | The Home Server: Home-Server Features (`/summarize`, `/personality`, `/guess_who`, AI replies) run only here |
| `TARGET_TEXT_CHANNEL_ID` | `199168135935295488` | Text-channel gate for responder features |
| `GUESS_WHO_CHANNEL_ID` | `199168135935295488` | Channel whose messages are archived and where `/guess_who` can run |
| `GUESS_WHO_BACKFILL_LIMIT` | `1000` | Maximum Discord messages scanned during startup backfill for Guess Who archive |
| `BOT_OWNER_ID` | unset | Optional privileged Discord user ID; blank/unset disables owner bypasses |
| `PALWORLD_API_URL` | `http://127.0.0.1:8212` | Palworld REST API base URL; the default assumes the server shares a host with the bot, which is false under Docker |
| `PALWORLD_ADMIN_KEY` | unset | Palworld `AdminPassword`, sent as HTTP Basic auth with username `admin`; setting it enables the live player tracker |
| `MINECRAFT_RCON_HOST` | `127.0.0.1` | Minecraft Java RCON host; set an address reachable from the bot container when Minecraft runs outside it |
| `MINECRAFT_RCON_PORT` | `25575` | Minecraft Java RCON port |
| `MINECRAFT_RCON_PASSWORD` | unset | Minecraft Java RCON password; setting it enables the live player tracker |

## Message Archive And Personality

`/guess_who` and personality training use the durable `archived_channel_messages` table as source material. The archive stores non-bot messages from `GUESS_WHO_CHANNEL_ID` with original Discord message ID, guild/channel ID, author user ID, global username, server display name, content, Discord message timestamp, archive/update timestamps, and nullable edit/delete timestamps.

Startup runs `backfillGuessWhoMessages()` after `clientReady` to scan up to `GUESS_WHO_BACKFILL_LIMIT` accessible messages and upsert them by original Discord message ID. Live `messageCreate`, `messageUpdate`, `messageDelete`, and `messageDeleteBulk` listeners keep the archive current. Before a `/guess_who` round shows a message the bot fetches it from Discord; an Unknown Message (10008) marks it deleted and another is picked, while other fetch errors only skip it for that round. Only an explicit `<@id>` mention typed in the message text counts as a guess; the automatic reply mention never does. A blank or invalid `GUESS_WHO_BACKFILL_LIMIT` falls back to 1000. Deleted messages stay in the archive for DBA-side history but are excluded from future game and personality training queries. The archive is the only stored copy of message content; there is no per-user message table. The in-memory AI conversation context (`src/lib/autoresponder/conversationHistory.ts`) is kept in sync by the `messageDelete` and `messageUpdate` listeners: a deleted message is removed and an edited message is replaced in place with its latest content.

Personality profile builders read eligible archived messages in bounded cursor windows. User profile creation needs 100 eligible messages; later refreshes need 20. Guild culture profile creation needs 200 eligible messages; later refreshes need 40. Profiles must not quote source messages directly.

`personalityEnabled` is a guild admin operational toggle, not consent or opt-in/opt-out language. Normal AI replies may use personality context silently; `/personality view user` and `/personality view guild` are the explicit inspection surfaces. With `PERSONALITY_GENERATION_ENABLED=false`, both profile builders return `skipped_generation_disabled` as their first step, so no caller (the `messageCreate` threshold trigger, startup backfill, the refresh task, `/personality refresh`) builds a profile or sends archived content to the LLM. Archiving and evidence counting keep running so re-enabling needs no backfill.

Responder and summarize LLM calls use `src/lib/llmProvider.ts`: Zen only, and only when `ZEN_API_KEY` is configured and `ZEN_ALLOW_DISCORD_CONTENT=true`; otherwise calls return `null` and features degrade gracefully. There is no fallback provider; the Zen LLM Provider is the only one (ADR 0006).

Every Zen call picks a budget mode (`LLM_BUDGETS`): `chat` (1500 output tokens, 30s), `summary` (4000, 120s), `personality` (4000, 180s); the token limit is sent as `max_tokens`. The limits are generous because `ZEN_MODEL` may be a reasoning model (production uses `minimax-m2.5`) whose reasoning tokens count toward `max_tokens`; a tight cap would truncate most replies. At most 3 Zen requests run at once with a 6-entry queue; when it is full, background calls (`callBackgroundLlm`: random replies, personality builds) are dropped first and return `null`. A response cut off by the token limit (`finish_reason: "length"`) is treated as no reply.

## Scheduled Tasks

Background tasks are plain modules under `src/tasks/`, each a `TaskDefinition` (`name`, optional `intervalMs`, `runOnStartup`, `run()`), listed by `getTasks()` in `src/tasks/index.ts` and driven by the in-process scheduler in `src/tasks/scheduler.ts` (ADR 0005). `index.ts` starts the scheduler once after login: it fires every `runOnStartup` task in a non-blocking cold-start pass, then arms one `setInterval` per task. A per-task guard, shared by the startup and interval runs, skips a tick while the previous run is still going; errors are logged per task and never stop the timer. `stop()` clears the timers. Tasks reach the client and logger through Sapphire's `container`; the trackers (`createSync*Tracker()`) hold their failure counters in a closure, so build them fresh per `getTasks()` call.

Cadence: `expireMutes`, `expireTempBans`, `sendReminders`, `endGiveaways`, and `endPolls` every 30 seconds; `syncPalworldTracker` and `syncMinecraftTracker` every 10 minutes; `publicStats` and `dashboardPresence` every `PUBLIC_STATS_INTERVAL_MS` / `DASHBOARD_PRESENCE_INTERVAL_MS` (they wait for `clientReady` before reading the guild cache); `refreshPersonalityProfiles` every 6 hours, only when `PERSONALITY_GENERATION_ENABLED`. All of these also run once at startup; `reloadOnRestart` runs only then. The bot must stay a single instance: a second process would run every task twice.

## Music

Music uses `discord-player` v7 with `DefaultExtractors` and `discord-player-youtubei`. Event wiring is in `src/lib/music/events.ts`; embeds/components/errors/cache helpers are under `src/lib/music/`. Music commands are gated by `IsDJ` where appropriate. Playback controls (commands and `musicButtons`) also share one same-channel rule, `getVoiceChannelRefusal` in `src/lib/music/voiceChannel.ts`, applied via the `InBotVoiceChannel` precondition (`/play` calls it inline): while the bot is connected to a voice channel, the member must be in it unless they have Administrator. `/queue` and `/nowplaying` are open. `YOUTUBE_COOKIE` may be passed to the YouTube extractor.

## Interaction Handlers

`customId` uses `:` as a delimiter. Convention: `<prefix>:<action>[:<page>]`. The `parse()` method usually uses `startsWith("<prefix>:")` to claim interactions.

Current handlers include music buttons, poll votes, giveaway entry, and help menu/buttons.

Failed and denied interactions are answered centrally by the listeners in `src/listeners/commands/` (chat input command and subcommand error/denied, interaction handler error/parse error) through `src/lib/interactionErrors.ts`. Unexpected errors reply ephemerally with "Something went wrong. Reference: `abc123`" and log the same reference; commands and handlers should throw rather than reply with raw error text.

## Preconditions

Available preconditions in command constructors: `GuildOnly`, `HomeServerOnly`, `IsModerator`, `IsAdmin`, `IsDJ`, `InBotVoiceChannel`. Moderator/Admin/DJ roles resolve from `guildSettings`, falling back to Discord permission flags. `IsModerator` takes the permission that fits the action as context, e.g. `{ name: "IsModerator", context: { permission: PermissionFlagsBits.BanMembers } }` (ban/unban: BanMembers; kick: KickMembers; mute/unmute: ModerateMembers; warn/purge/case/history/giveaway: ManageMessages). The moderator role or that permission passes; Administrator passes everything.

Staff commands set `setDefaultMemberPermissions` so regular members do not see them (moderation: its action permission, or ModerateMembers for warn/case/history; `/config`, `/autorespond`, `/giveaway`, `/level-reset`: ManageGuild). Server admins can widen visibility in Server Settings > Integrations. `/snipe` and `/editsnipe` are open to everyone; their caches drop entries older than 10 minutes.

## Code Style

Biome enforces tabs, double quotes, trailing commas, semicolons, and 120-character line width. Run `pnpm check` before committing when code or formatted docs change.

All local imports use `.js` extensions for ESM resolution, even when importing `.ts` source files.

Root TypeScript uses `module` and `moduleResolution` set to `NodeNext`, strict mode, decorators enabled, declarations/source maps, and the `#/*` path alias for `src/*`. Vitest also maps `#` to `src`.

New `pgEnum` values in Drizzle schema require a migration (`pnpm db:generate` + `pnpm db:migrate`) because `db:push` can silently skip enum changes.

## Testing

Use `pnpm test` for the full suite. DB-backed tests need a reachable test Postgres database.

Real-Zen personality e2e coverage is opt-in with `RUN_ZEN_E2E=1 ZEN_API_KEY=<key> ZEN_ALLOW_DISCORD_CONTENT=true pnpm vitest run tests/e2e/personality/zen-profile-generation.test.ts`; default runs and CI skip it. It makes real network calls to Zen and is required when prompts, the Zen integration, or profile generation change. It asserts profile structure, not prose.

Test hygiene rules (the suite runs files in parallel against one database):

- Give every DB-backed test file its own guild/user/message IDs; files must not share rows.
- Fire-and-forget work must be awaited before a test ends. Inline personality builds started by `messageCreate` are tracked in `src/lib/personality/inlineBuilds.ts`; call `settleInlineBuilds()` in `afterEach` and before asserting on their results.
- Seed large fixtures with one INSERT (`tests/helpers/archive.ts`), not a per-row loop. Raise a timeout only for work that is genuinely slow, per test.
- `vi.stubGlobal` and `vi.stubEnv` are undone automatically after each test (`unstubGlobals` / `unstubEnvs` in `vitest.config.ts`).
- Flip a feature flag inside the test (mock `src/lib/features.js` with a `vi.hoisted` getter, see `tests/integration/personality/profile-builders.test.ts`) instead of `it.skip`.

Tests are type-checked by `tsconfig.test.json` (Vitest-style ESM/bundler resolution, covers `src` and `tests`); `pnpm typecheck` runs it after the root `tsc --noEmit`.

## Pre-commit hook

`.githooks/pre-commit` runs `biome check --staged` (no auto-fix). `pnpm install` enables it through the `prepare` script, which sets `core.hooksPath` to `.githooks` and is a no-op where there is no repository (e.g. Docker). Typecheck and tests are left to CI.

Real-Ollama personality e2e coverage is opt-in with `RUN_OLLAMA_E2E=1 pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts`; default runs skip it when not opted in.

## Deployment

`docker-compose.yml` runs Postgres, the bot, and the Astro web server on the `botnet` bridge network. The production bot container runs migrations and starts the compiled bot with `sh -c "pnpm db:migrate && exec node dist/index.js"`; `exec` makes node receive SIGTERM directly so shutdown can run.

The `Dockerfile` has these stages:

- `base` installs full dependencies and copies source/config.
- `migration` is a small image target that can run `drizzle-kit migrate` if used separately.
- `production` is Debian-based, installs runtime dependencies, copies source, and runs the bot through `tsx`.

Compose injects the service hostname for `DATABASE_URL`, so local `.env` values are mainly for non-Docker development.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `theHimanshuShekhar/BhayanakBot`, managed with the `gh` CLI, using native blocked-by dependencies. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
