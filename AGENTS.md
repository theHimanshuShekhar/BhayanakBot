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

**Stores:**

| Store | Directory | Base class |
|---|---|---|
| Commands | `src/commands/<category>/` | `Command` / `Subcommand` |
| Listeners | `src/listeners/<category>/` | `Listener` |
| Interaction handlers | `src/interaction-handlers/` | `InteractionHandler` |
| Preconditions | `src/preconditions/` | `AllFlowsPrecondition` |

**Client:** `src/lib/BhayanakClient.ts` extends `SapphireClient`. It adds `player`, bounded in-memory caches for snipe/edit-snipe data, and anti-raid join tracking. It installs a custom Sapphire loader strategy so `tsx` development can load `.ts`, `.cts`, and `.mts` pieces.

**Mention Policy:** the client sets `allowedMentions` to `DEFAULT_ALLOWED_MENTIONS` (`src/lib/allowedMentions.ts`): no user/role/everyone parsing and no reply pings, so every bot message notifies nobody. A per-send `allowedMentions` replaces the default entirely, so features that must reach specific members (reminder owner, levelled-up member, giveaway winners) pass `notifyOnly([...userIds])`. Do not sanitise text instead.

**Entry point:** `src/index.ts` loads dotenv and the Sapphire logger and subcommands plugins, runs `validateRuntimeConfig()`, loads the discord-player extractors plus `discord-player-youtubei`, registers music player events, and logs in. On the first `clientReady` it removes stale global copies of the Home-Server commands and runs the Guess Who archive backfill (archive only; profiles are built by the scheduled task). After login it starts the in-process task scheduler and installs the shutdown and process error handlers.

**Shutdown:** `src/lib/shutdown.ts` builds the one idempotent `shutdown(reason, exitCode)` used by `src/index.ts`. SIGINT/SIGTERM exit 0, an uncaught exception or startup failure exits 1 (a later non-zero code overrides an earlier zero), and an unhandled rejection is only logged. It runs these steps in order, each isolated so one failure does not block the rest: stop the task scheduler, destroy the music player, destroy the Discord client, end the database pool (`closeDatabase()`). A 10-second unref'd timer forces exit if a step hangs.

**Database:** `src/lib/database.ts` uses Drizzle ORM over a `pg` connection pool (`buildPoolConfig`): `application_name` `bhayanakbot`, 10s connection timeout, 30s idle timeout, and a 60s `statement_timeout` (generous because personality and archive queries scan large message windows). Schema is in `src/db/schema.ts`; query helpers live in `src/db/queries/`.

Migrations: `drizzle/0016_safe_mod_case_numbers.sql` and `drizzle/0017_audit_concurrency_constraints.sql` were written by hand, so `drizzle/meta` has no snapshots for them (it resumes at `0018`); both are in `_journal.json` and run normally. Never edit an applied migration: change the schema and generate a new one. Production applies pending migrations whenever the bot container starts, so a migration reaches the live database on the next deploy.

Key query helpers:

- `guildSettings.ts` — per-guild config for channels, roles, XP, auto-mod, anti-raid, personality, and random responses. `getOrCreateSettings` is race-safe (insert on conflict do nothing, then select) and cached for 60 seconds in `src/lib/music/guildSettingsCache.ts`, shared with the music `IsDJ` lookup; `updateSettings` invalidates. Write `guild_settings` only through `updateSettings`, and call `invalidateGuildSettings` in tests that insert or delete rows directly.
- `archivedChannelMessages.ts` — durable archive of non-bot messages from the Guess Who channel, with edit/delete tracking and filtered random selection for `/guess_who`.
- `personalityTraining.ts` — archive-backed personality training eligibility, cursor-window queries, and the due-profile selection (`getUsersDueForPersonalityBuild`, `getGuildsDueForPersonalityBuild`) the scheduled task uses.
- `personality.ts` and `guildPersonality.ts` — user/guild personality profile lookup helpers.
- `modCases.ts` — auto-incrementing per-guild case numbers, mutes/tempbans with `expiresAt` and `active` flags.
- `autoResponses.ts` — static and LLM auto-responses with matching, regex, channel filters, mention requirements, chance, and trigger deletion. Regex triggers run on RE2 via `re2js` (`src/lib/autoresponder/regexTrigger.ts`): no lookarounds/backreferences, 100-char patterns, first 2000 chars of input, compiled patterns cached per response id; stored patterns that fail validation never run and show as disabled in `/autorespond list`.
- `users.ts`, `polls.ts`, `giveaways.ts`, `reminders.ts`, `afk.ts` — feature-specific persistence helpers.
- `publicStats.ts` and `dashboardPresence.ts` — the command counter and the latest public-stats and dashboard-presence snapshots the bot writes and the web service reads.

## Commands And Web Docs

Major Discord command areas:

- Leveling: `/rank`, `/leaderboard`, `/rewards`, `/level-reset`.
- Moderation: `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/unban`, `/purge`, `/case`, `/history`.
- Music: `/play`, `/music` (pause, resume, skip, stop, disconnect), `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/loop`.
- Utility: `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/afk`, `/remind`, `/help`, `/summarize`, `/personality`.
- Fun and games: `/8ball`, `/coinflip`, `/choose`, `/meme`, `/poll`, `/guess_who`.
- Server systems: `/config`, `/autorespond`, `/giveaway`.
- Minecraft: `/minecraft` shows `mc.bhayanak.net` status, Homestead version, live map link, required mods, and recommended mods.

`/summarize`, `/personality`, and `/guess_who` are Home-Server Features (ADR 0007): they register with `HOME_SERVER_REGISTRATION` (`guildIds: [TARGET_GUILD_ID]`) from `src/lib/homeServer.ts` and carry the `HomeServerOnly` precondition. Sapphire never deletes commands, so moving a command from global to guild registration leaves the old global one behind; `removeGlobalHomeServerCommands` (called on `clientReady`) deletes stale global copies of `HOME_SERVER_COMMAND_NAMES`. A new Home-Server command must be added to both. AI replies come from one pipeline, `answerMessage` in `src/lib/ai/replyPipeline.ts`, which `messageCreate` calls as its `reply` stage. It applies the One Reply Rule: `decideReply` (`src/lib/autoresponder/decideReply.ts`) picks a matching autoresponse (static or AI) first, otherwise a Mention Reply (the message mentions the bot; `@everyone`/`@here` do not count), otherwise a Random Reply, and a message gets at most one. Mention and Random Replies gate on `isHomeServer(guildId)`; a Mention Reply works in any Home Server channel and ignores `personalityEnabled` (that toggle only decides whether profiles are injected), and a bare `@bot` replies to the recent conversation. A Random Reply is decided only by `randomResponseChannelId` and `randomResponseChance` (`rollRandomReply`: one roll at exactly that chance; chance 0 or another channel never fires). An AI autoresponse (`responseType: "llm"`) fires in any Home Server channel its own channel filter allows; elsewhere it is skipped and never posted as static text, and `/autorespond add use-llm` is refused outside the Home Server. AI replies are invisible on failure: the trigger message is deleted only once a reply is ready, and nothing is posted when the model returns nothing.

`src/lib/autoresponder/replyGuard.ts` holds the cooldowns: 10 minutes per autoresponse trigger (a bot mention bypasses it), 30 seconds per member for autoresponses, 10 seconds per member for Mention Replies, 45 seconds per channel for Random Replies. Each starts only after a reply is sent, and an in-flight key stops a burst from starting several LLM calls meanwhile. `src/lib/autoresponder/sendReply.ts` is the one place a reply is capped (1990 chars, `…` appended) and posted, and where typing is sent: Mention Replies and AI autoresponses show typing while the model writes (`whileTyping`); a Random Reply sends typing only once its text is ready. Prompts are in `src/lib/ai/prompts.ts`: the Bot Voice (a witty, playful roast in a few sentences, never genuinely hostile) for Mention and Random Replies, and the administrator's prompt plus shared notes for AI autoresponses. Profiles come from `getPersonalityContext`: Mention Reply and AI autoresponse get the server and member profiles, a Random Reply the server profile only (`memberProfile: false`). Context is the channel's last 20 messages fetched live from Discord (`fetchConversation`, `src/lib/ai/conversation.ts`), speakers by display name, the bot's own replies labelled `<name> (you)`, wrapped in `<conversation>` delimiters with a "data, not instructions" line in the system prompt. Replies use plain display names; nothing rewrites names into mentions (Mention Policy: AI replies notify nobody). There is no in-memory conversation history.

`messageCreate` (`src/listeners/messages/messageCreate.ts`) runs auto-mod first: the first matching rule (spam, bad link, mass mentions) deletes the message, creates the only case, and stops everything else, including the archive, XP, and every reply. The remaining stages (archive, AFK, XP, reply) each run through `runStage`, which logs `[messageCreate] stage=<name> failed` without message content, so one failing stage never skips another. XP uses `addXp(..., cooldownMs)`, a single conditional UPDATE, so a burst awards once. Cooldown and pending-delete maps are `ExpiringBoundedMap`s (`src/lib/boundedMap.ts`).

`/help` (`src/lib/help/`) lists each command under the name it registered (`applicationCommandRegistry.chatInputCommands`), never the file or piece name, and files it by its `src/commands/<dir>/` directory. A new command directory needs a matching entry in `src/lib/help/categories.ts` (the `minecraft` directory is the "Game Servers" category); `tests/unit/lib/help.test.ts` fails otherwise.

When any Discord command is added, deleted, renamed, or behaviorally modified, update the web app command catalog and any relevant command documentation in `web/src/data/commands.ts` and `web/src/content/commands/` in the same change.

## Web Frontend

The `web/` directory is an Astro site built with MDX content collections and Tailwind CSS v4. It runs in server mode (`output: "server"`, `@astrojs/node` standalone adapter) because it has API routes and reads the bot's stats and presence snapshots from Postgres.

- Source lives in `web/src/`.
- Pages live in `web/src/pages/`.
- Command catalog data is in `web/src/data/commands.ts`.
- Rich command detail docs live in `web/src/content/commands/`.
- Components live in `web/src/components/`.
- `pnpm web:dev` runs Astro with `web/astro.config.mjs`.
- `pnpm web:build` outputs to `web/dist/` (the server entry is `web/dist/server/entry.mjs`).

The web app is not included in the bot TypeScript build because root `tsconfig.json` only includes `src/**/*`.

## Environment Variables

Keep `.env.example`, `README.md`, Docker Compose (the bot service's explicit `environment:` list), and this table in sync when environment variables change. `tests/unit/config/envContract.test.ts` fails when a variable the bot reads is missing from any of them, or when this table documents a variable nothing reads. A blank value counts as unset and falls back to the default (`src/lib/env.ts`).

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | required | Bot token |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot` | Postgres connection |
| `WEB_DATABASE_URL` | the bot's default `DATABASE_URL` | Compose only: the web service's Postgres URL. Set it to `postgresql://bhayanak_web:<password>@postgres:5432/bhayanakbot` to use the SELECT-only role on the two snapshot tables. Migration 0024 creates that role without a password; set one with `ALTER ROLE bhayanak_web PASSWORD '...'` first (README, Docker). The web service ignores `DATABASE_URL` |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test` | Vitest integration DB |
| `POSTGRES_PASSWORD` | `postgres` | Docker Postgres password; also the password in Compose's default `DATABASE_URL` for the bot and web services |
| `ZEN_API_KEY` | unset | opencode Zen API key; every AI call (responders, summaries, personality builds) requires it plus `ZEN_ALLOW_DISCORD_CONTENT=true`, and none are made without both. Personality profiles are built by the scheduled task only, so they need both too |
| `ZEN_ALLOW_DISCORD_CONTENT` | `false` | Must be `true` before Discord message content is sent to Zen; Zen is the only provider, so otherwise AI features stay silent |
| `ZEN_BASE_URL` | `https://opencode.ai/inference/go/openai/v1` | OpenAI-compatible Zen Go chat-completions base URL |
| `ZEN_MODEL` | `deepseek-v4.1-flash` | Primary Model for autoresponder, summaries, and user/guild personality generation |
| `ZEN_BACKUP_MODEL` | `glm-5.3-flash` | Backup Model: one retry when the Primary Model fails or refuses. Set equal to `ZEN_MODEL` to never try a backup |
| `ZEN_TIMEOUT_MS` | `30000` | Timeout for Zen chat replies only (minimum 1000); summaries (120s) and personality builds (180s) keep their own timeouts |
| `WEB_PORT` | `3000` in `.env.example`, `4321` Compose fallback | Host port for the web service |
| `PUBLIC_BOT_INVITE_URL` | Discord OAuth URL | Public invite link shown by the web app |
| `PUBLIC_STATS_INTERVAL_MS` | `300000` | Bot stats snapshot refresh interval |
| `DASHBOARD_PRESENCE_INTERVAL_MS` | `60000` | Dashboard presence snapshot refresh interval |
| `DASHBOARD_API_TOKEN` | unset | Read by the web service (not the bot). `GET /api/dashboard-presence` requires `Authorization: Bearer <token>` and answers 404 otherwise (constant-time compare, ADR 0004 amendment). Unset leaves it open and logs a one-time warning; set it on any internet-reachable deployment |
| `YOUTUBE_COOKIE` | unset | Optional cookie for `discord-player-youtubei` |
| `NODE_ENV` | unset | Controls log level (`debug` outside production, `info` in production) |
| `TARGET_GUILD_ID` | `199168135935295488` | The Home Server: Home-Server Features (`/summarize`, `/personality`, `/guess_who`, AI replies) run only here |
| `GUESS_WHO_CHANNEL_ID` | `199168135935295488` | Channel whose messages are archived and where `/guess_who` can run |
| `GUESS_WHO_BACKFILL_LIMIT` | `1000` | Maximum Discord messages scanned during startup backfill for Guess Who archive |
| `BOT_OWNER_ID` | unset | Optional privileged Discord user ID; blank/unset disables owner bypasses |
| `PALWORLD_API_URL` | `http://127.0.0.1:8212` | Palworld REST API base URL; the default assumes the server shares a host with the bot, which is false under Docker |
| `PALWORLD_ADMIN_KEY` | unset | Palworld `AdminPassword`, sent as HTTP Basic auth with username `admin`; setting it enables the live player tracker |
| `MINECRAFT_RCON_HOST` | `127.0.0.1` | Minecraft Java RCON host; set an address reachable from the bot container when Minecraft runs outside it (Compose defaults it to `mc`) |
| `MINECRAFT_RCON_PORT` | `25575` | Minecraft Java RCON port |
| `MINECRAFT_RCON_PASSWORD` | unset | Minecraft Java RCON password; setting it enables the live player tracker |

## Message Archive And Personality

`/guess_who` and personality training use the durable `archived_channel_messages` table as source material. The archive stores non-bot messages from `GUESS_WHO_CHANNEL_ID` with original Discord message ID, guild/channel ID, author user ID, global username, server display name, content, Discord message timestamp, archive/update timestamps, and nullable edit/delete timestamps.

Startup runs `backfillGuessWhoMessages()` after `clientReady` to scan up to `GUESS_WHO_BACKFILL_LIMIT` accessible messages and upsert them by original Discord message ID. Live `messageCreate`, `messageUpdate`, `messageDelete`, and `messageDeleteBulk` listeners keep the archive current. Before a `/guess_who` round shows a message the bot fetches it from Discord; an Unknown Message (10008) marks it deleted and another is picked, while other fetch errors only skip it for that round. Only an explicit `<@id>` mention typed in the message text counts as a guess; the automatic reply mention never does. A blank or invalid `GUESS_WHO_BACKFILL_LIMIT` falls back to 1000. Deleted messages stay in the archive for DBA-side history but are excluded from future game and personality training queries. The archive is the only stored copy of message content; there is no per-user message table.

Personality profiles come from one builder, `buildProfile` in `src/lib/personality/profileBuilder.ts`, run with two configurations: `buildPersonalityProfile` (user, `buildProfile.ts`) and `buildGuildPersonalityProfile` (server, `buildGuildProfile.ts`). It reads eligible archived messages after the profile's archive cursor (`lastTrainingMessageAt`/`lastTrainingMessageId`) in a bounded window. User profile creation needs 100 eligible messages; later refreshes need 20. Server culture profile creation needs 200; later refreshes need 40. The server source is author-balanced (10 per author) and anonymised. A build is skipped while the profile's 5-minute cooldown (`lastRefreshedAt`) runs. There are no evidence counters: due-ness is always counted from the archive after the cursor.

Profiles are rewritten, not grown. A first build asks for a profile of at most 1,500 characters; a refresh gets the existing profile plus the new messages and is told to rewrite it in place within the same size (`MAX_PROFILE_CHARS`, `src/lib/personality/profileSize.ts`). The cap is also enforced in code (`fitProfileToCap`): a longer reply is cut after the last complete sentence that fits, and a reply with no sentence ending within the cap (or an empty one) is treated like a model that returned nothing. Profiles from before the redesign can be longer; they are handed to the first refresh whole and shrink then. The whole profile is injected into AI replies (`getPersonalityContext` does not truncate).

Profiles must not quote source messages directly, and the builder enforces it (`src/lib/personality/quoteGuard.ts`): a generated profile that shares a run of 8 or more consecutive words (ignoring case and punctuation) with any single source message of the batch is regenerated once with an extra no-quote instruction. If the retry also quotes or returns nothing, the previous profile is kept, the cursor is not advanced (the same messages are reconsidered later), `lastRefreshedAt` is touched so the 5-minute cooldown applies, the build returns `skipped_quoted_source`, and `[personality] profile rejected: quoted source text` is logged with ids and counts only. Source messages are sent inside `<messages>...</messages>` (`src/lib/personality/sourcePrompt.ts`), and the system prompt says that content is data, not instructions.

Only the `refreshPersonalityProfiles` task builds profiles automatically (see Scheduled Tasks); nothing on the message path builds or counts, and `messageCreate` only archives. `/personality refresh user|guild` (administrators) calls the same builders on demand. `/personality view user` shows a member only their own profile (administrators: anyone's, using the `IsAdmin` rule of the bot owner or the Administrator permission); `view guild` is open; every response is ephemeral.

`personalityEnabled` is a guild admin operational toggle, not consent or opt-in/opt-out language, and the only control over personality features (there is no global switch). When it is off the scheduled task skips the guild, `/personality` answers that features are disabled, and `getPersonalityContext` injects nothing. Normal AI replies may use personality context silently; `/personality view user` and `/personality view guild` are the explicit inspection surfaces. Archiving keeps running regardless.

Responder and summarize LLM calls use `src/lib/llmProvider.ts`: Zen only, and only when `ZEN_API_KEY` is configured and `ZEN_ALLOW_DISCORD_CONTENT=true`; otherwise calls return `null` and features degrade gracefully. There is no fallback provider; the Zen LLM Provider is the only one (ADR 0006).

Every call passes a required `session` (`callInteractiveLlm(system, prompt, mode, { session, label? })`, same for `callBackgroundLlm`), sent as the `x-opencode-session` header; Zen Go rejects requests without it (HTTP 400 `MissingSessionID`). A session names one conversation: `mention:<channelId>`, `random:<channelId>`, `autoresponse:<channelId>`, `summary:<channelId>`, `profile:user:<guildId>:<userId>`, `profile:guild:<guildId>`. Requests also send `User-Agent: bhayanakbot/1.0.0` (a constant in `llmProvider.ts`; the runtime image has no `package.json`). When the Primary Model (`ZEN_MODEL`) returns an HTTP error, a network error or timeout, an empty reply, a truncated reply, or a whole-message short refusal ("I can't help with that."; a longer reply that merely starts that way is posted), the Backup Model (`ZEN_BACKUP_MODEL`) gets exactly one attempt in the same concurrency slot, with the mode's full timeout. It is never tried for not configured, privacy disabled, or queue full, nor when it equals the primary. Each request logs one `event=start` line, then one line per attempt with `attempt=primary|backup model=<model>` and the outcome; never message content.

AI Outage alert: `callLlm` reports each request's final outcome (success, or the last attempt's failure reason, the Backup Model's when it was tried) to the observer set with `setLlmOutcomeObserver`; `src/index.ts` registers `recordLlmOutcome` from `src/lib/aiOutage.ts` at startup, and nothing else in the provider knows about alerts. Only `http_error`, `fetch_error`, `empty` and `truncated` count as failures; `refusal`, `not_configured`, `privacy_disabled` and `queue_full` neither count nor reset the run, and a success resets it. The 5th consecutive failure posts one notice to the Home Server's `logChannelId` (failure count and last reason) and nothing more until the first later success, which posts one recovery notice (duration from the run's first failure, failure count). Notices rely on the client's default `allowedMentions`, so they notify nobody. Posting is fire and forget and never throws into the LLM call; with no log channel (or one that is missing or not text) it logs `[ai-outage]` warnings instead. State is in memory and a restart resets it; tests await `settleOutageNotices()` and call `resetAiOutage()`.

Every Zen call picks a budget mode (`LLM_BUDGETS`): `chat` (1500 output tokens, 30s), `summary` (4000, 120s), `personality` (4000, 180s); the token limit is sent as `max_tokens`. The limits are generous because `ZEN_MODEL` may be a reasoning model whose reasoning tokens count toward `max_tokens`; a tight cap would truncate most replies. At most 3 Zen requests run at once with a 6-entry queue; when it is full, background calls (`callBackgroundLlm`: random replies, personality builds) are dropped first and return `null`. A response cut off by the token limit (`finish_reason: "length"`) is treated as no reply.

## Scheduled Tasks

Background tasks are plain modules under `src/tasks/`, each a `TaskDefinition` (`name`, optional `intervalMs`, `runOnStartup`, `run()`), listed by `getTasks()` in `src/tasks/index.ts` and driven by the in-process scheduler in `src/tasks/scheduler.ts` (ADR 0005). `index.ts` starts the scheduler once after login: it fires every `runOnStartup` task in a non-blocking cold-start pass, then arms one `setInterval` per task. A per-task guard, shared by the startup and interval runs, skips a tick while the previous run is still going; errors are logged per task and never stop the timer. `stop()` clears the timers. Tasks reach the client and logger through Sapphire's `container`; the trackers (`createSync*Tracker()`) hold their failure counters in a closure, so build them fresh per `getTasks()` call.

Cadence: `expireMutes`, `expireTempBans`, `sendReminders`, `endGiveaways`, and `endPolls` every 30 seconds; `syncPalworldTracker` and `syncMinecraftTracker` every 10 minutes; `publicStats` and `dashboardPresence` every `PUBLIC_STATS_INTERVAL_MS` / `DASHBOARD_PRESENCE_INTERVAL_MS` (they wait for `clientReady` before reading the guild cache); `refreshPersonalityProfiles` every 6 hours. All of these also run once at startup; `reloadOnRestart` runs only then. The bot must stay a single instance: a second process would run every task twice.

`refreshPersonalityProfiles` is the only automatic profile builder. Each run asks `getGuildsDueForPersonalityBuild` and `getUsersDueForPersonalityBuild` (`src/db/queries/personalityTraining.ts`) which profiles are due: eligible archive messages after the profile's cursor (all eligible messages when there is no profile) reach the threshold, initial when no profile text exists yet and refresh otherwise, in guilds with `personalityEnabled` on or no settings row. It then builds the due server profiles and member profiles one at a time (one Zen call at a time), logging built/skipped/failed counts; a failing build is logged and does not stop the rest. It has no cap on the number of profiles per run.

## Music

Music uses `discord-player` v7 with `DefaultExtractors` and `discord-player-youtubei`. Event wiring is in `src/lib/music/events.ts`; embeds/components/errors/cache helpers are under `src/lib/music/`. Music commands are gated by `IsDJ` where appropriate. Playback controls (commands and `musicButtons`) also share one same-channel rule, `getVoiceChannelRefusal` in `src/lib/music/voiceChannel.ts`, applied via the `InBotVoiceChannel` precondition (`/play` calls it inline): while the bot is connected to a voice channel, the member must be in it unless they have Administrator. `/queue` and `/nowplaying` are open. `YOUTUBE_COOKIE` may be passed to the YouTube extractor.

## Interaction Handlers

`customId` uses `:` as a delimiter. Convention: `<prefix>:<action>[:<page>]`. The `parse()` method usually uses `startsWith("<prefix>:")` to claim interactions.

Current handlers include music buttons, poll votes, giveaway entry, and help menu/buttons.

Failed and denied interactions are answered centrally by the listeners in `src/listeners/commands/` (chat input command and subcommand error/denied, interaction handler error/parse error) through `src/lib/interactionErrors.ts`. Unexpected errors reply ephemerally with "Something went wrong. Reference: `abc123`" and log the same reference; commands and handlers should throw rather than reply with raw error text.

## Preconditions

Available preconditions in command constructors: `GuildOnly`, `HomeServerOnly`, `IsModerator`, `IsAdmin`, `IsDJ`, `InBotVoiceChannel`. Moderator/Admin/DJ roles resolve from `guildSettings`, falling back to Discord permission flags. `IsModerator` takes the permission that fits the action as context, e.g. `{ name: "IsModerator", context: { permission: PermissionFlagsBits.BanMembers } }` (ban/unban: BanMembers; kick: KickMembers; mute/unmute: ModerateMembers; warn/purge/case/history/giveaway: ManageMessages). The moderator role or that permission passes; Administrator passes everything.

Staff commands set `setDefaultMemberPermissions` so regular members do not see them (moderation: its action permission, or ModerateMembers for warn/case/history; `/config`, `/autorespond`, `/giveaway`, `/level-reset`: ManageGuild). Server admins can widen visibility in Server Settings > Integrations. `/snipe` and `/editsnipe` are open to everyone; their caches drop entries older than 10 minutes.

## Dependencies

`pnpm audit:prod` (`pnpm audit --prod --audit-level=high`) must stay clean. Advisories left below that gate, and the `overrides` in `pnpm-workspace.yaml`, are explained in `docs/dependency-advisories.md`. Renovate (`renovate.json`) opens a weekly grouped minor/patch PR and one PR per major. `pnpm-workspace.yaml` must be copied into the Docker build stages: it holds the overrides that `--frozen-lockfile` checks.

`undici`, `bgutils-js`, `googlevideo`, and `simple-ytdl-core` are direct dependencies only because `discord-player` / `discord-player-youtubei` need them as peers or import them undeclared (`simple-ytdl-core` in 3.1.0). Nothing in `src/` imports them; do not remove them as unused.

## Code Style

Biome enforces tabs, double quotes, trailing commas, semicolons, and 120-character line width. Run `pnpm check` before committing when code or formatted docs change.

All local imports use `.js` extensions for ESM resolution, even when importing `.ts` source files.

Root TypeScript uses `module` and `moduleResolution` set to `NodeNext`, strict mode, decorators enabled, declarations/source maps, and the `#/*` path alias for `src/*`. Vitest also maps `#` to `src`.

New `pgEnum` values in Drizzle schema require a migration (`pnpm db:generate` + `pnpm db:migrate`) because `db:push` can silently skip enum changes.

## Testing

Use `pnpm test` for the full suite. DB-backed tests need a reachable test Postgres database.

Real-Zen personality e2e coverage is opt-in with `RUN_ZEN_E2E=1 ZEN_API_KEY=<key> ZEN_ALLOW_DISCORD_CONTENT=true pnpm vitest run tests/e2e/personality/zen-profile-generation.test.ts`; default runs skip it. It makes real network calls to Zen and is required when prompts, the Zen integration, or profile generation change. It asserts profile structure, not prose.

Test hygiene rules (the suite runs files in parallel against one database):

- Give every DB-backed test file its own guild/user/message IDs; files must not share rows.
- Fire-and-forget work must be awaited before a test ends.
- Seed large fixtures with one INSERT (`tests/helpers/archive.ts`), not a per-row loop. Raise a timeout only for work that is genuinely slow, per test.
- `vi.stubGlobal` and `vi.stubEnv` are undone automatically after each test (`unstubGlobals` / `unstubEnvs` in `vitest.config.ts`).

Tests are type-checked by `tsconfig.test.json` (Vitest-style ESM/bundler resolution, covers `src` and `tests`); `pnpm typecheck` runs it after the root `tsc --noEmit`.

## CI

`.github/workflows/ci.yml` runs a `verify` job on pull requests and pushes to `main`, with a Postgres service: `pnpm audit:prod`, `pnpm check:ci`, `pnpm typecheck`, `pnpm test`, `pnpm web:build`. CI publishes no image; deployment is Dockhand building the stack from this repository.

## Pre-commit hook

`.githooks/pre-commit` runs `biome check --staged` (no auto-fix). `pnpm install` enables it through the `prepare` script, which sets `core.hooksPath` to `.githooks` and is a no-op where there is no repository (e.g. Docker). The hook does not run the type check or the tests; run `pnpm typecheck` and `pnpm test` yourself.

## Deployment

`docker-compose.yml` runs Postgres, the bot, and the Astro web server on the `botnet` bridge network. Dockhand builds the Compose stack from this repository (CI does not build images), so only the `Dockerfile` and Compose matter. The bot service runs `sh -c "node dist/db/migrate.js && exec node dist/index.js"`: migrations stay in the start command, and `exec` makes node receive SIGTERM directly so shutdown can run. The web service starts the prebuilt server with `node web/dist/server/entry.mjs` (`HOST`/`PORT` are image `ENV`s); it never rebuilds Astro at start.

`dist/db/migrate.js` (`src/db/migrate.ts`) applies `drizzle/` with drizzle-orm's migrator, because the runtime image has no dev dependencies and `drizzle-kit` is one. It reads and writes the same `drizzle.__drizzle_migrations` table, so it and `pnpm db:migrate` (still the dev and test command) are interchangeable. `tests/integration/db/migrate.test.ts` covers it.

The `Dockerfile` builds two runtime targets, `bot` and `web` (`docker build --target bot .`), both as non-root `node` with `COPY --chown` (never `chown -R` over `node_modules`):

- `toolchain` (internal) is Debian plus pnpm and python3/make/g++, so `@discordjs/opus` can compile when no prebuilt binary matches. `prod-deps` (`pnpm install --frozen-lockfile --prod`) and `build` (full install, `pnpm build`, `pnpm web:build`) extend it; no runtime image inherits the compilers.
- `bot` is `node:22-bookworm-slim` with `ca-certificates`, `procps` (the bot healthcheck is the anchored `pgrep -f '^node dist/index.js'`; the web service checks `GET /` with node), a static `ffmpeg` copied from `mwader/static-ffmpeg`, production `node_modules`, `dist/` and `drizzle/`.
- `web` is `node:22-alpine` plus `web/dist/` only. `web/astro.config.mjs` sets `vite.ssr.noExternal: true`, so the server bundle carries its dependencies and the image has no `node_modules`.

Base images and the ffmpeg image are pinned by version and digest (Renovate bumps both). `pnpm-workspace.yaml` is copied wherever `pnpm install --frozen-lockfile` runs. `.dockerignore` excludes `**/node_modules`, `**/dist` and `**/.env*`, so host dependencies, builds and secrets never enter the context. `@types/node` stays on the Node 22 major to match the images.

Compose injects the service hostname for the bot's `DATABASE_URL`, so local `.env` values are mainly for non-Docker development. The web service can connect as the read-only `bhayanak_web` role through `WEB_DATABASE_URL` (opt-in; README, Docker). Any new table or column the web reads needs a `GRANT SELECT` to that role in a migration; the role gets nothing by default.

All timestamps are `timestamp without time zone`, read and written as UTC: the pool sets `TimeZone=UTC` on every connection (`buildPoolConfig`) and the Postgres Compose service sets `TZ`/`PGTZ`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `theHimanshuShekhar/BhayanakBot`, managed with the `gh` CLI, using native blocked-by dependencies. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
