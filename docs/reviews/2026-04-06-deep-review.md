# BhayanakBot Deep Review — 2026-04-06

## P0 — Crash / Data Corruption

### 1. `String.repeat()` negative value (FIXED)
**Files:** `src/commands/rpg/profile.ts`
When `profile.xp` overshoots the current-level floor, `progress/needed > 1`, making `barFilled > 15` and `15 - barFilled` negative. Same for stat values > 100.
**Fix applied:** Clamped both values with `Math.min/Math.max`.

### 2. Race condition on coin deduction (everywhere)
**Files:** `src/commands/rpg/shop.ts`, `src/commands/rpg/pet.ts`, `src/commands/rpg/property.ts`, `src/commands/rpg/train.ts`, `src/interaction-handlers/rpgJailActions.ts`
Pattern: read `profile.coins` → check sufficiency → call `updateCoins(-cost)` in two separate DB round-trips. Concurrent requests can double-spend.
**Fix:** Atomic `tryDebitCoins(userId, cost)` that does `UPDATE … WHERE coins >= cost RETURNING coins` and returns `null` if the debit failed.

### 3. `addXpToProfile` double-update race
**Files:** `src/db/queries/rpg.ts`
Two separate `UPDATE` statements for `xp` and then `level`. A crash between them leaves the profile inconsistent. A concurrent request can also read stale XP.
**Fix:** Single `UPDATE rpgProfiles SET xp = xp + $1, level = floor(0.05 * sqrt(xp + $1)) WHERE userId = $2`.

### 4. Giveaway entries: read-modify-write JSON array
**Files:** `src/db/queries/giveaways.ts`
`addEntry` reads the JSON `entries` column, modifies it in JS, writes it back. Concurrent entries silently overwrite each other.
**Fix:** Separate `rpgGiveawayEntries(giveawayId, userId)` junction table with a unique constraint, or use a PostgreSQL `array_append` / `jsonb_set` expression.

### 5. Poll votes: read-modify-write on options JSONB
**Files:** `src/db/queries/polls.ts`
`vote()` reads the full row, patches `options[i].votes++` in JS, writes back. Two simultaneous votes on the same option lose one.
**Fix:** Move votes to a `pollVotes(pollId, userId, optionIndex)` table, or use `jsonb_set(options, '{i,votes}', (options->'i'->'votes')::int + 1)`.

### 6. `rob_player` victim can go negative
**Files:** `src/commands/rpg/crime.ts`
Reads victim's coins, then calls `updateCoins(victimId, -amount)` without checking the victim still has that amount. Victim balance can go negative.
**Fix:** Use atomic `tryDebitCoins(victimId, amount)`.

---

## P1 — Logic Bugs / Incorrect Behaviour

### 7. Music: YouTube URL incorrectly re-queries via SoundCloud
**Files:** `src/commands/music/play.ts`
When `isYT=true`, the code: (1) searches YouTube by the original URL to get title+author, (2) uses the extracted title as `finalQuery`, (3) passes `searchEngine: QueryType.SOUNDCLOUD_SEARCH`. So a YouTube URL ends up playing the closest SoundCloud track instead of the YouTube video.
**Fix:** When `isYT=true`, keep `searchEngine` as `QueryType.YOUTUBE_SEARCH` (or `undefined` with `finalQuery = query`).

### 8. `getNextCaseNumber` — non-atomic MAX+1
**Files:** `src/db/queries/modCases.ts`
`SELECT COALESCE(MAX(case_number), 0) + 1` then INSERT separately. Two concurrent mod actions can get the same case number.
**Fix:** Use a per-guild sequence (`CREATE SEQUENCE IF NOT EXISTS`) or a single `INSERT … RETURNING` with a subquery for the number.

### 9. `addXp(userId, guildId, 0)` increments `totalMessages`
**Files:** `src/db/queries/users.ts`
Some callers pass `amount=0` to fetch the user without adding XP. But the function always does `totalMessages + 1`.
**Fix:** Add an early return when `amount === 0`, or add a separate `getOrCreateUser` that doesn't touch counters.

### 10. Biased giveaway winner shuffle
**Files:** `src/scheduled-tasks/endGiveaways.ts`
`[...entries].sort(() => Math.random() - 0.5)` is a biased shuffle — not Fisher-Yates. For large entry lists the distribution is not uniform.
**Fix:** Implement Fisher-Yates: `for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }`.

### 11. Unsafe `ms()` cast
**Files:** `src/commands/moderation/ban.ts`, `src/commands/moderation/mute.ts`
`ms(durationStr as any) as unknown as number` — `ms()` returns `number | undefined` but undefined is silently treated as a valid duration. Malformed durations (e.g. `"abc"`) silently proceed.
**Fix:** `const duration = ms(durationStr); if (!duration) return reply("Invalid duration format.");`

### 12. No role hierarchy check in moderation
**Files:** `src/commands/moderation/ban.ts`, `src/commands/moderation/mute.ts`, `src/commands/moderation/kick.ts`
A moderator can ban/kick/mute users with equal or higher roles than the bot or the moderator themselves.
**Fix:** Compare `member.roles.highest.position` vs `target.roles.highest.position` and vs `guild.members.me.roles.highest.position`.

### 13. `pollVoteButtons` — no bounds check on `optionIndex`
**Files:** `src/interaction-handlers/pollVoteButtons.ts`
`optionIndex` comes from the custom ID string without validation. A crafted interaction could pass any number.
**Fix:** Validate `optionIndex >= 0 && optionIndex < poll.options.length` before calling `vote()`.

### 14. Scheduled tasks can overlap
**Files:** `src/index.ts`
`setInterval(..., 30_000)` fires regardless of whether the previous run has completed. Long-running tasks (e.g. expireMutes over many guilds) can stack.
**Fix:** Use a per-task `isRunning` boolean guard, or replace with proper BullMQ repeatable jobs (the plugin supports it).

### 15. `expireMutes` — deactivates case on unmute failure
**Files:** `src/scheduled-tasks/expireMutes.ts`
`.catch(() => null)` on `member.roles.remove()` swallows the error and then `deactivateCase` is still called, so the mute is marked as expired even if the role was never removed.
**Fix:** Check the result — only call `deactivateCase` if the role removal succeeded.

### 16. `rpgJailActions` bail — non-atomic coin deduction
**Files:** `src/interaction-handlers/rpgJailActions.ts`
`set({ coins: profile.coins - bailCost, jailUntil: null, ... })` — reads stale `profile.coins` from before deferring, not an atomic DB expression.
**Fix:** Use the atomic `tryDebitCoins` primitive + separate `SET jailUntil = NULL`.

---

## P2 — Memory Leaks / Hygiene

### 17. Unbounded Map caches
**Files:** `src/lib/BhayanakClient.ts`
`snipeCache`, `editSnipeCache`, `recentJoins` — Maps that grow without eviction. A busy server accumulates entries forever.
**Fix:** Use an LRU Map (e.g. `lru-cache` package, or a simple `Map` with a `maxSize` that deletes the oldest entry on insert) or schedule periodic pruning.

### 18. `spamTracker` never pruned
**Files:** `src/listeners/messages/messageCreate.ts`
The spam tracking Map is never cleared. Every `userId:guildId` pair that ever sent a message stays in memory.
**Fix:** Delete the entry after the window expires, or use the same LRU approach.

### 19. ReDoS via user-provided auto-response triggers
**Files:** `src/listeners/messages/messageCreate.ts`
Auto-response triggers stored in DB are compiled as `new RegExp(trigger, 'i')` on every message. A malicious guild admin can store a ReDoS-triggering pattern to hang the event loop.
**Fix:** Validate patterns at save time (`autoResponses create`), cache compiled `RegExp` objects per guild (re-compile only on settings change), and consider a regex complexity limit.

### 20. Magic number `BigInt(8)` for Administrator permission
**Files:** `src/listeners/messages/messageCreate.ts`
`BigInt(8)` is hardcoded for the Administrator permission flag.
**Fix:** Use `PermissionFlagsBits.Administrator`.

### 21. Discord.js deprecation warnings
**Files:** Many command files
- `ephemeral: true` in `interaction.deferReply` / `interaction.reply` → `flags: MessageFlags.Ephemeral`
- `fetchReply: true` in `interaction.reply` → use `interaction.reply(...).then(r => r.resource?.message)` or `withResponse: true`

### 22. Missing DB schema constraints
**File:** `src/db/schema.ts`
- `rpgOwnedProperties` has no unique constraint on `(userId, propertyId)` — duplicates possible at DB level
- `giveaways.messageId` has no unique index
- `polls.messageId` has no unique index
- `reactionRoles(messageId, emoji)` has no composite unique constraint
- `levelRewards(guildId, level)` has no composite primary/unique key

### 23. `pool.on('error')` not handled
**File:** `src/lib/database.ts`
Idle client errors in the `pg` pool are unhandled and will crash the process in Node.js.
**Fix:** `pool.on('error', (err) => { client.logger.error('DB pool error', err); })`.

---

## Suggested Execution Order

1. Schema migration (constraints + indexes) — enables DB-level protection before code changes
2. Atomic economy primitives (`tryDebitCoins`, fixed `addXpToProfile`)
3. Scheduled-task overlap guard
4. Normalize polls/giveaways (or atomic SQL updates)
5. Mod command helpers (`parseDuration`, `assertCanModerate`)
6. Memory-bounded caches
7. Discord.js deprecation sweep
8. Music play.ts YouTube fix (already partially correct, just wrong searchEngine)
9. Remaining P1 logic fixes
10. P2 hygiene
