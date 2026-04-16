# Personality Profiling — TO_FIX

A comprehensive review of the personality profiling feature (PR #73), documenting observed issues and suggested fixes. **No fixes have been applied yet — this is a punch list.**

## TL;DR

The most likely reasons the feature "isn't working":

1. **Ollama isn't running, isn't reachable, or the model isn't pulled** — builds silently return early (check logs for `[personality] Ollama returned null`).
2. **Inline build errors are swallowed without logging** (Bug 2) — any DB/runtime failure during `buildPersonalityProfile` leaves zero trace.
3. **A SQL `NULL` comparison bug** in `getUsersNeedingRefresh` (Bug 1) prevents the 6-hour scheduled task from picking up never-built profiles with `< 100` new messages.
4. **A race condition during the 120 s Ollama window** (Bug 3) orphans messages that arrive during a build — they accumulate in `user_messages` with `new_message_count = 0` and, combined with Bug 1, never get absorbed unless the user hits 100 more messages.

---

## End-to-end flow (for reference)

1. `src/listeners/messages/messageCreate.ts:31` receives a message
2. Skips bots, DMs, empty content, or messages starting with `/` (lines 32, 39)
3. `storeUserMessage` inserts into `user_messages` (line 40)
4. `incrementMessageCount` upserts `user_personality_profiles` with `new_message_count += 1` (line 41)
5. If `count >= 100` and no rebuild is in progress → `void buildPersonalityProfile(...)` (lines 43–45)
6. Scheduled fallback: `src/scheduled-tasks/refreshPersonalityProfiles.ts` every 6 h
7. `src/lib/personality/buildProfile.ts` fetches unabsorbed messages → calls Ollama (120 s timeout) → upserts profile → deletes absorbed messages → invalidates cache

---

## BUG 1 — CRITICAL — SQL `NULL` equality in `getUsersNeedingRefresh`

**File**: `src/db/queries/personality.ts:60`

```typescript
eq(userPersonalityProfiles.lastRefreshedAt, null as unknown as Date),
```

The `null as unknown as Date` cast is a red flag — it's bypassing the type system because Drizzle's `eq()` doesn't accept `null`. In PostgreSQL, `col = NULL` always evaluates to `NULL`, never `true`. Drizzle does not auto-translate this to `IS NULL`. So this clause **never matches any row**.

Additionally, `lastRefreshedAt < sixHoursAgo` on line 61 returns `NULL` when `lastRefreshedAt IS NULL`, so that clause also can't catch never-refreshed rows.

### Impact

Users with a row in `user_personality_profiles` where `lastRefreshedAt IS NULL` and `new_message_count` is between `1` and `99` are **never** picked up by the 6-hour scheduled task. They only ever get their first profile when they cross the 100-message inline threshold. For low-activity users, this may take days or weeks (or never).

### Suggested fix

```typescript
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

// ...

or(
  sql`${userPersonalityProfiles.newMessageCount} >= 100`,
  isNull(userPersonalityProfiles.lastRefreshedAt),
  lt(userPersonalityProfiles.lastRefreshedAt, sixHoursAgo),
),
```

---

## BUG 2 — HIGH — Inline builds swallow errors silently

**File**: `src/listeners/messages/messageCreate.ts:45`

```typescript
void buildPersonalityProfile(message.author.id, message.guild.id)
  .finally(() => profileRebuildInProgress.delete(rebuildKey));
```

There is **no `.catch()`**. If `buildPersonalityProfile` throws — DB write failure, cache access error, unexpected schema mismatch, anything — the error is dropped. `.finally()` correctly clears the lock so the next message can retry, but no log line is emitted. The user sees "nothing happening" with zero diagnostic breadcrumbs.

This is almost certainly why the feature feels broken.

### Suggested fix

```typescript
void buildPersonalityProfile(message.author.id, message.guild.id)
  .catch((err) =>
    container.logger.error(
      `[personality] Inline build failed for ${message.author.id}/${message.guild.id}:`,
      err,
    ),
  )
  .finally(() => profileRebuildInProgress.delete(rebuildKey));
```

Note: `container` is already imported in this file (via `@sapphire/framework`), or use `this.container.logger` inside the listener class.

---

## BUG 3 — HIGH — Race condition: messages sent during build get orphaned

**Files**: `src/lib/personality/buildProfile.ts:22-61` and `src/db/queries/personality.ts:29-37`

The build path runs **unwrapped** across a long-running Ollama call:

1. `getUnabsorbedMessages` captures current message IDs `[1..N]` (line 23)
2. Ollama call can take up to 120 seconds (line 47)
3. `upsertPersonalityProfile` writes the new profile with `set: { profile, newMessageCount: 0, lastRefreshedAt: new Date() }` (line 53 + `personality.ts:35`) — **unconditionally resets `new_message_count` to 0**
4. `deleteAbsorbedMessages(messages.map(m => m.id))` deletes only the originally captured IDs (line 54)

During the 120 s window, new messages from the same user continue to flow through `messageCreate`:
- `storeUserMessage` inserts new rows `[N+1..N+k]` into `user_messages`
- `incrementMessageCount` climbs `101, 102, ...`
- The inline rebuild is blocked by `profileRebuildInProgress`

After step 3+4:
- `user_messages` still contains rows `[N+1..N+k]` (not included in the delete list)
- `new_message_count` is `0` (clobbered by the upsert)

Combined with **Bug 1**, these orphans are effectively invisible to the scheduler:
- The scheduler filters `new_message_count > 0` — `0 > 0` is false
- Their `user_messages` rows accumulate silently until the user sends 100 *more* messages

### Suggested fix

Track how many messages were actually absorbed and decrement the counter by that exact amount instead of resetting to zero. Refactor `upsertPersonalityProfile` to accept `absorbedCount` and do:

```typescript
set: {
  profile,
  newMessageCount: sql`GREATEST(0, ${userPersonalityProfiles.newMessageCount} - ${absorbedCount})`,
  lastRefreshedAt: new Date(),
},
```

Pair this with Bug 5's transaction fix so absorb + delete + counter-decrement are atomic.

---

## BUG 4 — MEDIUM — Unsafe destructuring in `incrementMessageCount`

**File**: `src/db/queries/personality.ts:41-49`

```typescript
const [row] = await db
  .insert(userPersonalityProfiles)
  .values(...)
  .onConflictDoUpdate(...)
  .returning({ newMessageCount: userPersonalityProfiles.newMessageCount });
return row.newMessageCount;
```

If `.returning()` ever yields an empty array (driver edge case, pool reset mid-query, schema/migration mismatch), `row` is `undefined` and `row.newMessageCount` throws `TypeError: Cannot read properties of undefined`. This runs in the message listener path, so the listener rejects and no further personality work happens for that message. Unlikely but cheap to guard.

### Suggested fix

```typescript
const [row] = await db.insert(...)...returning(...);
if (!row) {
  throw new Error(`incrementMessageCount: empty returning for ${userId}/${guildId}`);
}
return row.newMessageCount;
```

---

## BUG 5 — MEDIUM — Profile upsert and message delete aren't atomic

**File**: `src/lib/personality/buildProfile.ts:53-54`

```typescript
await upsertPersonalityProfile(userId, guildId, result);
await deleteAbsorbedMessages(messages.map((m) => m.id));
```

Two separate awaits. If the process crashes, the DB connection drops, or the `DELETE` fails between them:

- Profile is updated (reflects the messages)
- Messages remain in `user_messages`
- Next build feeds the same messages into Ollama again → biased/duplicated profile content

### Suggested fix

Wrap in a single `db.transaction()`:

```typescript
await db.transaction(async (tx) => {
  await upsertPersonalityProfileTx(tx, userId, guildId, result, messages.length);
  await deleteAbsorbedMessagesTx(tx, messages.map((m) => m.id));
});
```

Requires refactoring the query helpers to accept a `tx` handle. Combine with Bug 3's counter-decrement fix.

---

## BUG 6 — LOW — No per-guild feature flag

**Files**: `src/db/schema.ts` (`guildSettings` definition), `src/listeners/messages/messageCreate.ts:39`

The feature runs unconditionally on every guild. Admins have no way to opt out (privacy, performance, or just preference). There's no column on `guildSettings` to gate it.

### Suggested fix

Add to `guildSettings`:

```typescript
personalityEnabled: boolean("personality_enabled").default(true).notNull(),
```

Gate the block in `messageCreate.ts:39`:

```typescript
if (settings.personalityEnabled && trimmedContent.length > 0 && !trimmedContent.startsWith("/")) {
  // ... existing personality block
}
```

Requires `pnpm db:generate` + `pnpm db:migrate`. Optionally add a slash-subcommand under the existing settings command to toggle it.

---

## BUG 7 — LOW — Unbounded message block in the Ollama prompt

**File**: `src/lib/personality/buildProfile.ts:28`

```typescript
const messageBlock = messages.map((m) => m.content).join("\n");
```

No cap on message count or total character length. If a user accumulates thousands of unabsorbed messages (plausible given Bug 1 + Bug 3 cause orphaning) the prompt can:
- Exceed the model's context window, producing garbage or truncated output
- Cause the 120 s timeout to hit every time, creating a permanent stuck state

### Suggested fix

Cap the absorb size per build, e.g.:

```typescript
const MAX_MESSAGES_PER_BUILD = 500;
const MAX_CHARS_PER_BUILD = 40_000; // tune to model

let messageBlock = "";
const absorbed: typeof messages = [];
for (const m of messages.slice(-MAX_MESSAGES_PER_BUILD)) {
  if (messageBlock.length + m.content.length > MAX_CHARS_PER_BUILD) break;
  messageBlock += (messageBlock ? "\n" : "") + m.content;
  absorbed.push(m);
}
// ...
await deleteAbsorbedMessages(absorbed.map((m) => m.id));
```

---

## BUG 8 — LOW — Sequential scheduled task has no soft deadline

**File**: `src/scheduled-tasks/refreshPersonalityProfiles.ts:17-23`

The scheduled task awaits each user's build serially with up to a 120 s Ollama timeout. Worst case is `N × 120 s`. The `personalityTaskRunning` flag in `src/index.ts:58` prevents overlap, but if the work consistently exceeds 6 hours, a backlog grows.

### Suggested fix

Cap users per tick (e.g., 50), sort by priority (largest `new_message_count` first, then oldest `last_refreshed_at`):

```typescript
const users = await getUsersNeedingRefresh({ limit: 50 });
```

And add a sort in `getUsersNeedingRefresh`:

```typescript
.orderBy(
  desc(userPersonalityProfiles.newMessageCount),
  asc(userPersonalityProfiles.lastRefreshedAt),
)
.limit(limit)
```

---

## Environmental causes — verify FIRST

These are more likely than any code bug to explain the reported symptoms. Check before touching code:

1. **Is Ollama reachable?** From the bot's host/container run:
   ```bash
   curl "$OLLAMA_URL/api/tags"
   ```
   If this fails, `callOllama` returns `null`, `buildProfile.ts:48-50` logs `[personality] Ollama returned null for userId=… guildId=…, skipping profile update` at `warn` level. Grep logs for that exact string.

2. **Is the model pulled?** `ensureOllamaModel` (`src/lib/ollama.ts:4-21`) calls `POST /api/pull` at startup but returns silently on failure (line 13). Look for startup log `[ollama] pull status: success` — absence means the pull failed and every subsequent `generate` call will also fail.

3. **Model name mismatch**: `OLLAMA_MODEL` defaults to `llama3.1:8b` (`src/lib/ollama.ts:2`). If `.env` specifies a model that isn't pulled, every call returns `null`.

4. **Threshold not yet met**: The inline trigger needs `new_message_count >= 100`. Only plain-text, non-slash-command messages increment. Run:
   ```sql
   SELECT user_id, guild_id, new_message_count, last_refreshed_at
   FROM user_personality_profiles
   WHERE guild_id = '<guild>'
   ORDER BY new_message_count DESC
   LIMIT 20;
   ```
   And to see accumulated raw messages:
   ```sql
   SELECT user_id, COUNT(*) FROM user_messages WHERE guild_id = '<guild>' GROUP BY user_id ORDER BY 2 DESC;
   ```

5. **Log level**: Successful builds log at `debug` (`buildProfile.ts:60`). If `NODE_ENV != development`, these never surface. The `info`-level line `[personality] Refreshing profiles for N user(s)` from the scheduled task (`refreshPersonalityProfiles.ts:14`) is the best at-a-glance liveness signal — look for it every 6 hours in logs.

---

## Recommended triage order

1. Verify Ollama is up and the model is pulled (curl + log grep).
2. **Fix Bug 2** — one-line `.catch()` — makes all future failures visible, essential for further debugging.
3. **Fix Bug 1** — swap `eq(..., null)` → `isNull(...)` — restores the scheduled fallback for never-built profiles.
4. **Fix Bugs 3 + 5 together** — atomic transaction with counter-decrement — closes the orphan-messages hole.
5. Optional hardening: Bugs 4, 6, 7, 8.

## Files referenced

- `src/listeners/messages/messageCreate.ts` (1–47)
- `src/db/queries/personality.ts` (1–66)
- `src/lib/personality/buildProfile.ts` (1–61)
- `src/lib/ollama.ts` (1–58)
- `src/scheduled-tasks/refreshPersonalityProfiles.ts` (1–25)
- `src/index.ts` (36, 55–67)
- `src/db/schema.ts` (212–232)
- `src/lib/BhayanakClient.ts` (44, 86) — `personalityCache`
