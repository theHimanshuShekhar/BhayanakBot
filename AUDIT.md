# BhayanakBot Codebase Audit

Date: 2026-06-01  
Repository: `/home/hshekhar/code/BhayanakBot`

## Executive Summary

I reviewed the Discord bot, database layer, scheduled tasks, web documentation site, test suite, deployment files, and prior review notes. The codebase is in a generally healthy state from a build/test perspective: TypeScript compilation, Astro web build, and the Vitest suite all pass. The largest risks are not syntax/build failures; they are production safety issues around privileged fallbacks, privacy/LLM data flow, and several non-atomic database write paths that can corrupt counters or double-pay rewards under concurrency.

Highest-priority work should focus on:

1. Removing the hardcoded privileged `BOT_OWNER_ID` fallback.
2. Making high-value database updates atomic and adding missing unique constraints.
3. Tightening privacy controls/logging for Discord message content and LLM prompts.
4. Fixing `expireTempBans` so failed Discord unbans are retried instead of marked inactive.
5. Making lint a usable CI gate by resolving or intentionally excluding generated warnings.

## Audit Scope

Reviewed areas:

- Bot entrypoint and runtime wiring: `src/index.ts`, `src/lib/BhayanakClient.ts`.
- Discord commands, listeners, interaction handlers, preconditions, and scheduled tasks.
- Database schema, Drizzle migrations, and query helpers under `src/db/`.
- LLM/Ollama/Zen provider code and personality/message archive flows.
- RPG module, leveling, moderation, polls, giveaways, tickets, and utility features.
- Web command catalog/docs under `web/src/` and command content pages.
- Tests under `tests/`.
- Deployment/configuration files: `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `tsconfig.json`, `biome.json`, `vitest.config.ts`.
- Previous review notes in `docs/reviews/2026-04-06-deep-review.md`.

## Validation Performed

| Check | Result | Notes |
|---|---:|---|
| `pnpm build` | Passed | Root TypeScript build completed successfully. |
| `pnpm web:build` | Passed | Astro server build and prerendering completed successfully. |
| `pnpm test` | Passed | 27 files passed, 1 skipped; 383 tests passed, 1 skipped. Test setup applied Drizzle migrations against the reachable test DB. |
| `pnpm lint` | Warnings | Biome checked 200 files and reported 233 warnings. It did not fail the command, but the volume makes lint weak as a quality gate. |
| LSP diagnostics: `src` | 1 hint | `src/commands/tickets/ticket.ts` has unused `OverwriteType`. |
| LSP diagnostics: `web/src` | Hints | Astro `content.config.ts` reports many `z` deprecation hints. |

## Positive Findings

- Core builds and tests currently pass.
- `.env`, `dist/`, `web/dist/`, and `node_modules/` are ignored and not tracked in the working tree.
- Docker Compose does not publish Postgres, Valkey, or Ollama ports; only the web service is exposed.
- Message archive/personality test coverage is relatively strong compared with the rest of the project.
- Important schema constraints added since the previous review are present for some tables, e.g. `users`, `reaction_roles`, `level_rewards`, and `rpg_owned_properties`.
- `tryDebitCoins()` uses an atomic guarded update for coin deduction, which is the right pattern for other economy updates to follow.
- LLM provider logs do not print the Zen API key.

## Documentation Cross-Reference Index

This section cross-references each audit finding with existing repository documentation. It distinguishes between prior documentation that already identified the issue, design/plan docs that establish the intended behavior, and gaps where no dedicated documentation currently exists.

| Audit finding | Existing documentation reference | Relationship / note |
|---|---|---|
| 1. Hardcoded privileged `BOT_OWNER_ID` fallback | `AGENTS.md` environment variable table; `README.md` environment setup; `docs/superpowers/plans/2026-05-26-guess-who-message-archive.md` shows the project pattern of adding new env constants and Compose entries. | `BOT_OWNER_ID` is documented as an environment variable in repo guidance, but the audit finding notes the implementation still has a real hardcoded fallback and Compose does not pass it. |
| 2. Non-atomic moderation case numbers | `docs/reviews/2026-04-06-deep-review.md`, P1 item 8: ``getNextCaseNumber` — non-atomic MAX+1`. | Previously documented and still relevant. This audit updates the recommendation to include a unique `(guild_id, case_number)` constraint plus atomic allocation. |
| 3. Quest completion double-pay risk | `docs/reviews/2026-04-06-deep-review.md`, P0 item 2: race conditions on coin deduction; P0 item 3: `addXpToProfile` double-update race; `docs/superpowers/specs/2026-04-05-rpg-module-design.md`; RPG phase plans under `docs/superpowers/plans/2026-04-05-rpg-*`. | Existing RPG docs cover economy/quest design, and the prior review calls out related race classes. This specific quest reward transition needs explicit follow-up coverage/tests. |
| 4. Lost leveling XP increments | `docs/reviews/2026-04-06-deep-review.md`, P0 item 3: `addXpToProfile` double-update race and P1 item 9: `addXp(userId, guildId, 0)` increments `totalMessages`; `docs/superpowers/plans/2026-05-17-high-level-tests.md`. | Previously documented class of bug. Current audit identifies `src/db/queries/users.ts` `addXp()` as another read/modify/write XP path needing atomic SQL and concurrency tests. |
| 5. Non-atomic daily claims | `docs/superpowers/specs/2026-04-05-rpg-module-design.md`; RPG phase plans in `docs/superpowers/plans/2026-04-05-rpg-*`; `web/src/content/commands/daily.mdx`. | Daily reward behavior is documented for users/design, but the concurrency guard is not. Add this as an implementation/test requirement. |
| 6. Discord content sent to third-party Zen | `AGENTS.md` Message Archive And Personality section; `docs/adr/0001-archived-messages-for-personality-training.md`; `docs/adr/0002-real-ollama-personality-e2e-tests.md`; `docs/superpowers/specs/2026-05-30-llm-provider-logging-design.md`; `web/src/content/commands/personality.mdx`; `web/src/content/commands/autorespond.mdx`; `web/src/content/commands/summarize.mdx`. | Existing docs establish archive-backed personality behavior and Zen/Ollama provider logging goals. The audit adds a privacy-provider policy gap: docs should say when Discord content can leave local infrastructure. |
| 7. Sensitive LLM/prompt logging | `docs/superpowers/specs/2026-05-30-llm-provider-logging-design.md`; `docs/superpowers/plans/2026-05-30-llm-provider-logging.md`. | Directly conflicts with the documented logging goal: production diagnostics should avoid Discord message content, prompts, responses, API keys, user IDs, and channel IDs. |
| 8. `expireTempBans` deactivates cases after failed unban | `docs/reviews/2026-04-06-deep-review.md`, P1 item 15: `expireMutes` deactivates case on unmute failure; `docs/reviews/2026-04-06-deep-review.md`, P1 item 14: scheduled tasks can overlap; `docs/superpowers/plans/2026-05-17-full-integration-test-suite.md`, scheduled task test task. | Previous review identified the same failure mode for mutes. The tempban task now has the analogous problem and should inherit that documented remediation pattern. |
| 9. Poll/giveaway JSON read-modify-write | `docs/reviews/2026-04-06-deep-review.md`, P0 item 4: giveaway entries read-modify-write; P0 item 5: poll votes read-modify-write; P2 item 22: missing DB constraints; `web/src/content/commands/poll.mdx`; `web/src/content/commands/giveaway.mdx`. | Previously documented and still relevant. User-facing docs describe behavior, but schema/query docs need concurrency-safe storage. |
| 10. RPG inventory stacking race | `docs/reviews/2026-04-06-deep-review.md`, P0 item 2: economy race conditions; `docs/superpowers/specs/2026-04-05-rpg-module-design.md`; `web/src/content/commands/inventory.mdx`; `web/src/content/commands/shop.mdx`. | Existing RPG docs cover inventory/economy behavior but not the uniqueness model or concurrent stacking semantics. |
| 11. Permission preconditions rely on member cache | `AGENTS.md` Preconditions section; command docs for admin/moderator features under `web/src/content/commands/*.mdx`. | Preconditions are documented at an architectural level, but no existing doc states how interaction member data should be fetched. Add this convention after fixing. |
| 12. Public snipe/edit-snipe privacy exposure | `web/src/content/commands/snipe.mdx`; `web/src/content/commands/editsnipe.mdx`; `web/src/data/commands.ts`. | The commands are documented for users, but the privacy/moderation policy is not. Update docs if the commands become moderator-only, ephemeral, or opt-in. |
| 13. Unbounded LLM/Ollama queue | `docs/superpowers/plans/2026-04-05-rpg-phase3-crime-jail-ollama.md` includes Ollama Compose/runtime assumptions; `docs/superpowers/specs/2026-04-06-mention-responder-design.md`; `docs/superpowers/specs/2026-04-06-random-channel-responder-design.md`; `docs/superpowers/specs/2026-05-30-llm-provider-logging-design.md`. | Existing docs discuss LLM features and single local Ollama service assumptions. They do not define queue bounds, backpressure, or per-guild rate limits. |
| 14. Production Docker image hardening | `Dockerfile`; `docker-compose.yml`; `AGENTS.md` Deployment section; `docs/superpowers/plans/2026-04-05-rpg-phase3-crime-jail-ollama.md` Docker/Compose plan. | Deployment docs describe current runtime through `tsx`; the audit recommends a production-hardening change that should be reflected in docs if implemented. |
| 15. Biome lint warnings | `AGENTS.md` Commands and Code Style sections; `docs/superpowers/plans/2026-05-30-rich-command-docs.md` says to run `pnpm check`; `docs/superpowers/plans/2026-05-17-high-level-tests.md` includes test/lint scripts. | Existing docs establish Biome/check expectations. Current warning volume means the documented quality gate is weaker than intended. |
| 16. Missing production-safe config validation | `AGENTS.md` Environment Variables section; `README.md`; `.env.example`; `docker-compose.yml`; environment-variable additions in superpowers plans. | Docs list required/default variables, but implementation lacks one typed source of truth that enforces them at startup. |
| 17. Duplicate `user_messages` indexes | `docs/reviews/2026-04-06-deep-review.md`, P2 item 22: missing DB schema constraints; Drizzle migrations under `drizzle/*.sql`. | Related to prior schema-constraint review. This audit adds a migration hygiene/schema drift issue. |
| 18. Structural tests do not enforce filesystem coverage | `docs/superpowers/specs/2026-05-17-high-level-tests-design.md`; `docs/superpowers/plans/2026-05-17-high-level-tests.md`; `docs/superpowers/plans/2026-05-17-full-integration-test-suite.md`. | Testing docs call for high-level coverage, but current structure tests do not dynamically discover new files. |
| 19. Ambiguous “profiling” language in personality docs | `AGENTS.md` Message Archive And Personality section; `web/src/content/commands/personality.mdx`; `web/src/content/commands/config.mdx`; `web/src/data/commands.ts`; `docs/adr/0001-archived-messages-for-personality-training.md`. | Direct documentation consistency issue: repo guidance says `personalityEnabled` is operational, not consent/opt-in/opt-out language, while public docs still use “profiling”. |
| 20. LSP/deprecation/generated-file housekeeping | `AGENTS.md` Code Style section; `docs/superpowers/plans/2026-05-30-rich-command-docs.md`; `web/src/content.config.ts`; `web/src/routeTree.gen.ts`. | Existing docs expect formatting/check cleanliness, but generated/deprecated web artifacts currently add diagnostic noise. |

## Findings

### 1. High — Hardcoded owner ID can grant privileged access in deployments that omit `BOT_OWNER_ID`

**Evidence**

- `src/lib/constants.ts` defaults `BOT_OWNER_ID` to `"199168135935295488"`.
- `src/preconditions/IsAdmin.ts`, `src/preconditions/IsModerator.ts`, and `src/preconditions/IsDJ.ts` all bypass normal permission checks when the requester matches `BOT_OWNER_ID`.
- `docker-compose.yml` does not pass `BOT_OWNER_ID` to the bot service environment.

**Impact**

Any production deployment that forgets to set `BOT_OWNER_ID` grants a real hardcoded Discord account elevated bot access. This affects admin, moderator, and DJ-gated commands.

**Recommendation**

- Remove the fallback value entirely.
- Treat owner bypass as disabled when `BOT_OWNER_ID` is unset, or require it through startup config validation.
- Add `BOT_OWNER_ID` to Compose if the bypass remains supported.
- Add tests proving owner bypass is disabled when unset.

---

### 2. High — Moderation case numbers can duplicate under concurrency

**Evidence**

- `src/db/queries/modCases.ts` computes `caseNumber` with `COALESCE((SELECT MAX(case_number) ...), 0) + 1` during insert.
- `src/db/schema.ts` has no unique constraint on `(guild_id, case_number)` for `mod_cases`.
- `getCase(guildId, caseNumber)` assumes the pair identifies one case.

**Impact**

Two moderators acting at the same time can create cases with the same guild-local number. This makes `/case` lookups ambiguous and weakens moderation auditability.

**Recommendation**

- Add a unique index on `(guild_id, case_number)`.
- Allocate case numbers inside a transaction with a per-guild advisory lock, or store per-guild counters in a separate row and increment atomically.
- Add a concurrency integration test.

---

### 3. High — Quest completion can double-pay rewards

**Evidence**

- `src/db/queries/rpg.ts` `checkAndAdvanceQuestProgress()` reads existing progress, calculates `newProgress`, writes an absolute progress value, then pays coins/XP and calls `onComplete()` if the local calculation reaches the objective.
- This is not a transaction and does not guard on `completed_at IS NULL` during reward payout.

**Impact**

Two simultaneous qualifying actions can both see an incomplete quest and both award completion rewards.

**Recommendation**

- Use a transaction with an atomic conditional update such as `progress = progress + 1` where `completed_at IS NULL`.
- Award only when the returned row transitions from incomplete to complete.
- Add tests that run concurrent quest advancement calls.

---

### 4. High — Leveling XP increments can be lost

**Evidence**

- `src/db/queries/users.ts` `addXp()` reads the current user row, computes `newXp = user.xp + amount`, then writes the absolute value.
- `getOrCreateUser()` does a find then insert instead of an insert-on-conflict path.

**Impact**

Concurrent message handlers can overwrite each other. For example, two handlers reading XP 100 and adding 15 can both write 115 instead of 130.

**Recommendation**

- Change `addXp()` to an atomic SQL increment and return the updated XP/level.
- Use insert-on-conflict for user creation.
- Add concurrency tests around `addXp()` and first-message user creation.

---

### 5. High — Daily reward claims are not atomically guarded

**Evidence**

- `src/commands/rpg/daily.ts` checks `canClaimDaily(profile.lastDailyAt)` before calling `claimDaily()`.
- `src/db/queries/rpg.ts` `claimDaily()` updates coins, XP, streak, and `lastDailyAt` without a database predicate proving the cooldown is still expired.

**Impact**

Two near-simultaneous `/daily` interactions can both pass the precheck and both receive rewards.

**Recommendation**

- Move the cooldown predicate into the `UPDATE` statement or lock the profile row in a transaction.
- Return a claim-denied result when no row was updated.
- Add a double-submit integration test.

---

### 6. High — Discord message content may be sent to third-party Zen without strong privacy controls

**Evidence**

- `src/lib/llmProvider.ts` tries Zen first when `ZEN_API_KEY` is configured.
- `src/lib/autoresponder/llmResponse.ts` builds prompts from Discord message content/history.
- `src/lib/personality/buildProfile.ts` and `src/lib/personality/buildGuildProfile.ts` send archived message samples for profile generation.

**Impact**

Private Discord content, message history, and derived personality material can leave local infrastructure when Zen is enabled. Current repo guidance says `personalityEnabled` is an operational toggle, not consent/opt-in language, so this deserves explicit privacy treatment.

**Recommendation**

- Add a clear provider/privacy policy in config and docs.
- Consider a mode that forces personality/profile generation to local Ollama only.
- Add per-guild disclosure and opt-out/retention controls.
- Minimize prompt contents and redact obvious secrets before sending to any external model.

---

### 7. Medium — Sensitive Discord/LLM content is logged

**Evidence**

- `src/lib/ollama.ts` logs prompt slices and raw response slices.
- `src/listeners/messages/messageCreate.ts` logs message/reply snippets in autoresponder debug paths.
- Test output also shows LLM request logging is noisy.

**Impact**

Production logs can contain user messages, generated replies, and possibly secrets pasted into Discord.

**Recommendation**

- Gate raw prompt/response logging behind an explicit debug flag.
- Redact content by default.
- Prefer structured metadata logs: request ID, provider, latency, token/character counts, and result status.

---

### 8. Medium — `expireTempBans` marks tempbans inactive even when Discord unban fails

**Evidence**

- `src/scheduled-tasks/expireTempBans.ts` calls `guild.members.unban(...).catch(() => null)` and then immediately deactivates the moderation case and creates an `unban` case.

**Impact**

If the Discord unban fails because of permissions, API errors, or missing guild state, the database says the tempban expired while the user remains banned. The retry loop will not correct it because the case was deactivated.

**Recommendation**

- Match the safer mute-expiry pattern: only deactivate after a successful Discord action.
- Log failed unbans and leave the case active for retry.
- Add a scheduled-task unit test for unban failure.

---

### 9. Medium — Poll votes and giveaway entries use lossy JSON read-modify-write updates

**Evidence**

- `src/db/queries/polls.ts` reads a poll, mutates JSON option vote arrays, and writes the whole `options` JSON back.
- `src/db/queries/giveaways.ts` reads a giveaway, mutates the `entries` array, and writes the whole array back.
- `src/db/schema.ts` lacks unique indexes on `polls.message_id` and `giveaways.message_id`, despite query helpers treating message IDs as unique.

**Impact**

Concurrent votes or entries can overwrite each other. Duplicate rows with the same message ID would make future updates ambiguous.

**Recommendation**

- Normalize votes and giveaway entries into child tables with primary keys, or use transactions/row locks.
- Add unique indexes on `polls.message_id` and `giveaways.message_id`.
- Add concurrency tests for voting and entering giveaways.

---

### 10. Medium — RPG inventory stacking can duplicate rows or lose quantities

**Evidence**

- `src/db/queries/rpg.ts` `addItem()` does a separate lookup, then either updates `existing.quantity + quantity` or inserts.
- `src/db/schema.ts` `rpg_inventory` has a serial primary key but no uniqueness model for stackable items.

**Impact**

Concurrent drops/rewards can create duplicate rows for the same item or lose quantity increments.

**Recommendation**

- Decide the intended uniqueness model for stackable/equipped items.
- Add a unique constraint for stackable item rows and use `ON CONFLICT DO UPDATE SET quantity = quantity + excluded.quantity`.
- Add concurrent reward/drop tests.

---

### 11. Medium — Permission checks rely on member cache in several interaction paths

**Evidence**

- `src/preconditions/IsAdmin.ts`, `src/preconditions/IsModerator.ts`, and `src/preconditions/IsDJ.ts` read `interaction.guild.members.cache.get(interaction.user.id)`.
- Some command code also uses `interaction.guild!.members.cache` for admin checks.

**Impact**

Valid admins/mods/DJs can be denied if their member object is not cached, especially after restarts or in large guilds.

**Recommendation**

- Prefer `interaction.memberPermissions` for built-in Discord permissions.
- Fetch the member before denying when role-based config checks are needed.
- Add tests for uncached interaction members.

---

### 12. Medium — Public snipe/edit-snipe commands can resurface deleted or edited messages to ordinary users

**Evidence**

- `src/listeners/messages/messageDelete.ts` and `src/listeners/messages/messageUpdate.ts` cache deleted/edited message content.
- `/snipe` and `/editsnipe` are utility commands gated only by `GuildOnly`.
- Responses are public rather than ephemeral.

**Impact**

Any member with command access can resurface content another user deleted or edited. This can create privacy and moderation issues.

**Recommendation**

- Restrict these commands to moderators, make responses ephemeral, and/or add per-guild opt-in controls.
- Consider excluding sensitive channels.

---

### 13. Medium — LLM/Ollama queue is unbounded

**Evidence**

- `src/lib/ollama.ts` stores jobs in an unbounded in-memory array.
- LLM calls can use long timeouts, e.g. 90–120 seconds in background/interactive paths.

**Impact**

Repeated triggers or scheduled profile generation can grow memory and cause long waits for user-facing responses.

**Recommendation**

- Add max queue length, queue wait timeout, and per-guild/global rate limits.
- Track queue metrics in logs or bot health.
- Drop or coalesce low-priority background jobs under load.

---

### 14. Medium — Production Docker image runs source through `tsx` with full dependencies as root

**Evidence**

- `Dockerfile` production stage installs full dependencies, includes build tooling, and runs `pnpm exec tsx src/index.ts`.
- No non-root `USER` is set.

**Impact**

The production container has a larger attack surface and runs as root. Runtime also depends on TypeScript execution tooling instead of compiled output.

**Recommendation**

- Build TypeScript in a builder stage.
- Copy compiled `dist/`, migrations, and production dependencies only.
- Run as the `node` user or another non-root user.

---

### 15. Medium — Biome lint currently reports 233 warnings

**Evidence**

- `pnpm lint` reports: `Checked 200 files in 58ms. No fixes applied. Found 233 warnings.`
- Examples include non-null assertions in command handlers and explicit `any` in generated `web/src/routeTree.gen.ts`.

**Impact**

Lint is noisy enough that new warnings can be missed. If CI allows warnings, lint is not enforcing the intended style/safety baseline.

**Recommendation**

- Fix non-null assertions and simple style warnings.
- Exclude or generated-ignore `web/src/routeTree.gen.ts` if it is truly generated.
- Decide whether warnings should fail CI after cleanup.

---

### 16. Low/Medium — Missing production-safe configuration validation

**Evidence**

- `src/index.ts` calls `client.login(process.env.DISCORD_TOKEN)` without an explicit typed config validation step.
- `src/lib/database.ts` falls back to `postgresql://postgres:postgres@localhost:5432/bhayanakbot`.
- `src/lib/constants.ts` silently falls back to hardcoded guild/channel/owner IDs.
- Compose passes only a subset of supported environment variables.

**Impact**

Misconfigured deployments can run with unintended defaults or fail late with unclear errors.

**Recommendation**

- Add a `src/lib/config.ts` loader using Zod or similar.
- Fail startup in production when required variables are missing or unsafe defaults are used.
- Keep `.env.example`, README, Compose, and AGENTS docs synchronized from that source of truth.

---

### 17. Low/Medium — Duplicate `user_messages` indexes exist in migrations

**Evidence**

- `drizzle/0005_chunky_triathlon.sql` creates `idx_user_messages_user_guild` on `(user_id, guild_id)`.
- `drizzle/0008_dazzling_kabuki.sql` creates `user_messages_user_id_guild_id_index` on the same columns.
- Current schema has only one unnamed index declaration.

**Impact**

Migrated databases carry redundant write overhead and schema drift noise.

**Recommendation**

- Add a migration to drop one duplicate index.
- Give the remaining schema index an explicit stable name.

---

### 18. Low/Medium — Structural tests do not enforce filesystem coverage

**Evidence**

- `tests/unit/commands/structure.test.ts`, `tests/unit/listeners/structure.test.ts`, and `tests/unit/preconditions/structure.test.ts` rely on hardcoded arrays and only assert they are non-empty.

**Impact**

New command/listener/precondition files can be added without the tests noticing or validating them.

**Recommendation**

- Dynamically glob the corresponding source directories and assert equality with the expected list.
- Or remove the hardcoded list and test every discovered file.

---

### 19. Low — Some web command docs use ambiguous “profiling” language

**Evidence**

- Public docs mention personality “profiling” in places such as `web/src/data/commands.ts` and `web/src/content/commands/config.mdx` / `personality.mdx`.
- Repository guidance says `personalityEnabled` is an operational toggle, not consent or opt-in/opt-out language.

**Impact**

The docs can confuse admins/users about what is consent, what is operational behavior, and what data is sent to model providers.

**Recommendation**

- Reword docs toward “personality features”, “personality context”, or “profile generation”.
- Add a privacy/provider note if Zen is enabled.

---

### 20. Low — LSP hints and generated/deprecated web artifacts need housekeeping

**Evidence**

- LSP reports unused `OverwriteType` in `src/commands/tickets/ticket.ts`.
- LSP reports many deprecation hints for `z` in `web/src/content.config.ts`.
- `web/src/routeTree.gen.ts` produces explicit `any` lint warnings.

**Impact**

These are not currently breaking builds, but they add noise and hide more important diagnostics.

**Recommendation**

- Remove unused imports.
- Update Astro content config to the non-deprecated schema API if available.
- Treat generated files consistently: ignore them, regenerate them, or commit generated-safe output.

## Test Coverage Gaps

Current coverage is strongest around personality/profile behavior and some RPG helpers. Add focused tests for:

- Concurrent moderation case creation.
- Concurrent `addXp()` and first-message user creation.
- Double-submitted `/daily` claims.
- Concurrent quest completion/reward payout.
- Concurrent poll votes and giveaway entries.
- Concurrent inventory stacking.
- `expireTempBans` when Discord unban fails.
- Precondition behavior when a guild member is not cached.
- Snipe/edit-snipe permission and ephemeral behavior if changed.

## Suggested Remediation Order

1. **Safety/config:** remove hardcoded `BOT_OWNER_ID` fallback; add typed production config validation.
2. **Data integrity:** add missing unique constraints and convert XP, daily, quest, poll, giveaway, and inventory updates to atomic/transactional patterns.
3. **Moderation correctness:** fix `expireTempBans` retry behavior and mod case number allocation.
4. **Privacy:** redact LLM logs; define provider/privacy policy for Zen vs Ollama; update public docs.
5. **Operational hardening:** bound LLM queues, add metrics, and harden Docker production image.
6. **Quality gates:** reduce Biome warnings, clean generated files/deprecation hints, and strengthen structural tests.

## Notes on Previous Review Items

`docs/reviews/2026-04-06-deep-review.md` already identified several related issues, including non-atomic case numbering, poll/giveaway JSON read-modify-write, missing schema constraints, and scheduled-task failure handling. Some have been fixed since then, but several remain or have close variants in the current codebase. Treat this audit as an updated queue, not a duplicate of the older review.
