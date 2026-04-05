# BhayanakBot Bug Fixes & Refactors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all P0 crashes, race conditions, logic bugs, memory leaks, and hygiene issues identified in the 2026-04-06 deep review.

**Architecture:** Each task is self-contained. Economy atomicity is foundational — do it first, then all commands that debit coins call the new helper. Schema migration runs before code changes so DB constraints back up code-level guards.

**Tech Stack:** TypeScript, Sapphire Framework, discord.js v14, Drizzle ORM, PostgreSQL, discord-player v7

---

### Task 1: Schema migration — add missing unique constraints and indexes

**Files:**
- Modify: `src/db/schema.ts`
- Generate migration: `pnpm db:generate` → `drizzle/`

- [ ] **Step 1: Add unique/composite constraints to schema.ts**

In `src/db/schema.ts`, update these table definitions:

```ts
// users table — add composite PK
export const users = pgTable(
  "users",
  {
    userId: varchar("user_id", { length: 20 }).notNull(),
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    xp: integer("xp").default(0).notNull(),
    level: integer("level").default(0).notNull(),
    totalMessages: integer("total_messages").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.guildId] })],
);

// reactionRoles — add composite PK
export const reactionRoles = pgTable(
  "reaction_roles",
  {
    messageId: varchar("message_id", { length: 20 }).notNull(),
    emoji: varchar("emoji", { length: 100 }).notNull(),
    roleId: varchar("role_id", { length: 20 }).notNull(),
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    type: reactionRoleTypeEnum("type").default("normal").notNull(),
    groupId: varchar("group_id", { length: 50 }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.emoji] })],
);

// levelRewards — add composite PK
export const levelRewards = pgTable(
  "level_rewards",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    level: integer("level").notNull(),
    roleId: varchar("role_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.level] })],
);

// rpgOwnedProperties — add unique constraint
export const rpgOwnedProperties = pgTable(
  "rpg_owned_properties",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 20 }).notNull(),
    propertyId: varchar("property_id", { length: 50 }).notNull(),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
    lastCollectedAt: timestamp("last_collected_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.propertyId)],
);
```

Also add `unique` to imports: `import { ..., unique } from "drizzle-orm/pg-core";`

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: new file created in `./drizzle/` (e.g. `0002_constraints.sql`)

- [ ] **Step 3: Apply migration**

```bash
pnpm db:migrate
```

Expected: `All migrations applied successfully`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(schema): add missing unique constraints and composite PKs"
```

---

### Task 2: Atomic coin deduction — add tryDebitCoins helper

**Files:**
- Modify: `src/db/queries/rpg.ts`

- [ ] **Step 1: Add tryDebitCoins after updateCoins**

In `src/db/queries/rpg.ts`, after the `updateCoins` function (line ~48), add:

```ts
/**
 * Atomically deduct `amount` coins from a user.
 * Returns the new coin balance, or null if the user had insufficient funds.
 */
export async function tryDebitCoins(userId: string, amount: number): Promise<number | null> {
	const [row] = await db
		.update(rpgProfiles)
		.set({ coins: sql`${rpgProfiles.coins} - ${amount}` })
		.where(and(eq(rpgProfiles.userId, userId), sql`${rpgProfiles.coins} >= ${amount}`))
		.returning({ coins: rpgProfiles.coins });
	return row?.coins ?? null;
}
```

- [ ] **Step 2: Fix addXpToProfile — single atomic update**

Replace the current `addXpToProfile` (lines 191–208) with:

```ts
export async function addXpToProfile(
	userId: string,
	amount: number,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
	const [row] = await db
		.update(rpgProfiles)
		.set({
			xp: sql`${rpgProfiles.xp} + ${amount}`,
			level: sql`FLOOR(0.05 * SQRT(${rpgProfiles.xp} + ${amount}))::int`,
		})
		.where(eq(rpgProfiles.userId, userId))
		.returning({ xp: rpgProfiles.xp, level: rpgProfiles.level });
	if (!row) throw new Error(`RPG profile not found for userId: ${userId}`);
	const oldLevel = Math.floor(0.05 * Math.sqrt(row.xp - amount));
	const leveledUp = row.level > oldLevel;
	return { newXp: row.xp, newLevel: row.level, leveledUp };
}
```

- [ ] **Step 3: Fix addXp in users.ts — don't increment totalMessages when amount=0**

In `src/db/queries/users.ts`, replace the `addXp` function:

```ts
export async function addXp(userId: string, guildId: string, amount: number): Promise<{ user: User; leveledUp: boolean; newLevel: number }> {
	const user = await getOrCreateUser(userId, guildId);

	if (amount === 0) {
		return { user, leveledUp: false, newLevel: user.level };
	}

	const newXp = user.xp + amount;
	const newLevel = Math.floor(0.1 * Math.sqrt(newXp));
	const leveledUp = newLevel > user.level;

	const [updated] = await db
		.update(users)
		.set({ xp: newXp, level: newLevel, totalMessages: sql`${users.totalMessages} + 1`, lastMessageAt: new Date() })
		.where(and(eq(users.userId, userId), eq(users.guildId, guildId)))
		.returning();

	return { user: updated, leveledUp, newLevel };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/rpg.ts src/db/queries/users.ts
git commit -m "fix(rpg): atomic coin deduction, single-query XP update, fix addXp(0) side-effect"
```

---

### Task 3: Apply tryDebitCoins to all coin-spending commands

**Files:**
- Modify: `src/commands/rpg/shop.ts`
- Modify: `src/commands/rpg/pet.ts`
- Modify: `src/commands/rpg/property.ts`
- Modify: `src/commands/rpg/train.ts`
- Modify: `src/interaction-handlers/rpgJailActions.ts`
- Modify: `src/commands/rpg/crime.ts` (rob_player victim deduction)

- [ ] **Step 1: Fix shop.ts buy flow**

In `src/commands/rpg/shop.ts`, find the buy handler. Replace the pattern:
```ts
// OLD: read profile.coins, check, then updateCoins
const { profile } = await getOrCreateProfile(interaction.user.id);
if (profile.coins < item.price) { /* error */ }
await updateCoins(interaction.user.id, -item.price);
```
With:
```ts
// NEW: atomic debit — no need to read coins first
import { tryDebitCoins } from "../../db/queries/rpg.js";
// ...
const remaining = await tryDebitCoins(interaction.user.id, item.price);
if (remaining === null) {
    const { profile } = await getOrCreateProfile(interaction.user.id);
    return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(
            `❌ You need **${item.price.toLocaleString()} coins** to buy **${item.name}**, but you only have **${profile.coins.toLocaleString()}**.`
        )],
    });
}
```

- [ ] **Step 2: Fix pet.ts adopt flow**

In `src/commands/rpg/pet.ts`, same pattern — replace the coin check + `updateCoins(-pet.price)` in the `adopt` branch:

```ts
// Remove: const { profile } = await getOrCreateProfile(...)
// Remove: if (profile.coins < pet.price) { ... }
// Remove: await updateCoins(interaction.user.id, -pet.price);
// Add:
const remaining = await tryDebitCoins(interaction.user.id, pet.price);
if (remaining === null) {
    const { profile } = await getOrCreateProfile(interaction.user.id);
    return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(
            `❌ You need **${pet.price.toLocaleString()} coins** to adopt ${pet.emoji} **${pet.name}**, but you only have **${profile.coins.toLocaleString()}**.`
        )],
    });
}
```

- [ ] **Step 3: Fix property.ts buy flow**

In `src/commands/rpg/property.ts`, the `buy` branch:

```ts
// Remove the getOrCreateProfile + coins check + updateCoins(-prop.price) pattern
// Add after the "already owns" check:
const remaining = await tryDebitCoins(interaction.user.id, prop.price);
if (remaining === null) {
    const { profile } = await getOrCreateProfile(interaction.user.id);
    return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(
            `❌ You need **${prop.price.toLocaleString()} coins** to buy ${prop.emoji} **${prop.name}**, but you only have **${profile.coins.toLocaleString()}**.`
        )],
    });
}
await addProperty(interaction.user.id, propertyId);
```

- [ ] **Step 4: Fix train.ts coin check**

In `src/commands/rpg/train.ts`, find where it checks `profile.coins < cost` then calls `updateCoins(-cost)`. Replace with `tryDebitCoins`.

- [ ] **Step 5: Fix rpgJailActions.ts bail**

In `src/interaction-handlers/rpgJailActions.ts`, the bail action currently does:
```ts
// OLD — stale coins value, non-atomic
await db.update(rpgProfiles).set({ coins: profile.coins - bailCost, jailUntil: null, jailBailCost: 0 })
```
Replace with:
```ts
import { tryDebitCoins } from "../db/queries/rpg.js";
// ...
const remaining = await tryDebitCoins(userId, bailCost);
if (remaining === null) {
    // re-fetch to show accurate balance in error
    const { profile: fresh } = await getOrCreateProfile(userId);
    await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(
            `❌ You need **${bailCost.toLocaleString()} coins** to bail out, but you only have **${fresh.coins.toLocaleString()}**.`
        )],
        ephemeral: true,
    });
    return;
}
await db.update(rpgProfiles).set({ jailUntil: null, jailBailCost: 0 }).where(eq(rpgProfiles.userId, userId));
```

- [ ] **Step 6: Fix crime.ts rob_player victim deduction**

In `src/commands/rpg/crime.ts`, the rob_player success block (around line 150):
```ts
// OLD
const { profile: victimProfile } = await getOrCreateProfile(target.id);
pay = Math.min(randomPay(job.payRange[0], job.payRange[1]), victimProfile.coins);
await updateCoins(target.id, -pay);
await updateCoins(interaction.user.id, pay);

// NEW — victim can't go below 0
const maxPay = randomPay(job.payRange[0], job.payRange[1]);
const debited = await tryDebitCoins(target.id, maxPay);
pay = debited !== null ? maxPay : 0;
if (pay === 0) {
    // victim has no coins — rob fails gracefully
    const { profile: victimProfile } = await getOrCreateProfile(target.id);
    pay = victimProfile.coins; // steal whatever they have (may be 0)
    if (pay > 0) await tryDebitCoins(target.id, pay);
}
if (pay > 0) await updateCoins(interaction.user.id, pay);
```

- [ ] **Step 7: Commit**

```bash
git add src/commands/rpg/shop.ts src/commands/rpg/pet.ts src/commands/rpg/property.ts src/commands/rpg/train.ts src/interaction-handlers/rpgJailActions.ts src/commands/rpg/crime.ts
git commit -m "fix(rpg): replace coin check+update pattern with atomic tryDebitCoins"
```

---

### Task 4: Fix music play command — wrong search engine for YouTube URLs

**Files:**
- Modify: `src/commands/music/play.ts`

- [ ] **Step 1: Fix the searchEngine assignment**

In `src/commands/music/play.ts`, the `player.play()` call currently passes `QueryType.SOUNDCLOUD_SEARCH` when `isYT` is true. This is the opposite of what we want. Replace lines 53–68:

```ts
const { track } = await player.play(voiceChannel, finalQuery, {
    searchEngine: isYT ? QueryType.YOUTUBE_SEARCH : undefined,
    nodeOptions: {
        metadata: {
            channel: interaction.channel,
            requestedBy: interaction.user,
        },
        selfDeaf: true,
        volume: 80,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 30_000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 30_000,
    },
    requestedBy: interaction.user,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/music/play.ts
git commit -m "fix(music): use YOUTUBE_SEARCH when replaying YouTube URLs, not SOUNDCLOUD_SEARCH"
```

---

### Task 5: Scheduled task overlap guard + Fisher-Yates shuffle

**Files:**
- Modify: `src/index.ts`
- Modify: `src/scheduled-tasks/endGiveaways.ts`

- [ ] **Step 1: Add overlap guard in index.ts**

Replace the `setInterval` block in `src/index.ts` (lines 31–40):

```ts
const taskRunning: Record<string, boolean> = {};
for (const taskName of tasks) {
    setInterval(async () => {
        if (taskRunning[taskName]) return;
        taskRunning[taskName] = true;
        try {
            await client.stores.get("scheduled-tasks").get(taskName)?.run(null as never);
        } catch (err) {
            client.logger.error(`[ScheduledTask:${taskName}] Error:`, err);
        } finally {
            taskRunning[taskName] = false;
        }
    }, 30_000);
}
```

- [ ] **Step 2: Fix Fisher-Yates in endGiveaways.ts**

In `src/scheduled-tasks/endGiveaways.ts`, replace line 17:
```ts
// OLD
const winners = [...entries].sort(() => Math.random() - 0.5).slice(0, winnerCount);

// NEW — unbiased Fisher-Yates
function shuffled<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const winners = shuffled(entries).slice(0, winnerCount);
```

(Place `shuffled` above the class declaration in the file.)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts src/scheduled-tasks/endGiveaways.ts
git commit -m "fix: scheduled task overlap guard + unbiased Fisher-Yates giveaway shuffle"
```

---

### Task 6: Fix expireMutes — only deactivate when role removal succeeded

**Files:**
- Modify: `src/scheduled-tasks/expireMutes.ts`

- [ ] **Step 1: Guard deactivateCase on success**

In `src/scheduled-tasks/expireMutes.ts`, replace the inner block (lines 27–33):

```ts
if (settings?.mutedRoleId) {
    const member = await guild.members.fetch(modCase.userId).catch(() => null);
    if (member) {
        const removed = await member.roles.remove(settings.mutedRoleId, "Mute expired").then(() => true).catch(() => false);
        if (!removed) {
            this.container.logger.warn(`[ExpireMutes] Failed to remove muted role from ${modCase.userId} in ${modCase.guildId}`);
            // Don't deactivate — will retry next interval
            continue;
        }
    }
}

await deactivateCase(modCase.id);
// createCase for unmute log omitted intentionally if member left guild — only log if guild resolved
await createCase({
    guildId: modCase.guildId,
    userId: modCase.userId,
    moderatorId: this.container.client.user!.id,
    type: "unmute",
    reason: "Mute duration expired",
    active: false,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/scheduled-tasks/expireMutes.ts
git commit -m "fix(moderation): only deactivate mute case when role removal succeeds"
```

---

### Task 7: Mod command — safe ms() parsing + role hierarchy check

**Files:**
- Modify: `src/commands/moderation/ban.ts`
- Modify: `src/commands/moderation/mute.ts`
- Modify: `src/commands/moderation/kick.ts`

- [ ] **Step 1: Fix ban.ts ms() cast (it's already correct)**

In `src/commands/moderation/ban.ts`, the `ms()` cast already checks `if (!duration)`. The cast `ms(durationStr as any) as unknown as number` is ugly but safe since the null check is right after. Clean it up:

```ts
// Replace:
duration = ms(durationStr as any) as unknown as number;

// With:
duration = ms(durationStr) ?? null;
if (durationStr && !duration) return interaction.editReply("❌ Invalid duration format. Use e.g. `7d`, `24h`, `30m`.");
```

Note: `ms()` accepts `string`, so no cast needed. The `as any` was unnecessary.

- [ ] **Step 2: Add role hierarchy check to ban.ts**

In `src/commands/moderation/ban.ts`, after fetching `targetUser` and before the try/catch ban block, add:

```ts
const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
if (targetMember) {
    const myHighest = interaction.guild!.members.me!.roles.highest.position;
    const modHighest = (interaction.member as GuildMember).roles.highest.position;
    const targetHighest = targetMember.roles.highest.position;
    if (targetHighest >= myHighest) {
        return interaction.editReply("❌ I cannot ban a member with an equal or higher role than me.");
    }
    if (targetHighest >= modHighest) {
        return interaction.editReply("❌ You cannot ban a member with an equal or higher role than you.");
    }
}
```

Add `GuildMember` to discord.js imports.

- [ ] **Step 3: Fix mute.ts ms() cast + add hierarchy check**

Apply the same ms() fix and hierarchy check pattern to `src/commands/moderation/mute.ts`.

- [ ] **Step 4: Add hierarchy check to kick.ts**

Read `src/commands/moderation/kick.ts` and add the same `targetHighest >= myHighest / modHighest` guard.

- [ ] **Step 5: Commit**

```bash
git add src/commands/moderation/ban.ts src/commands/moderation/mute.ts src/commands/moderation/kick.ts
git commit -m "fix(moderation): safe ms() parsing, role hierarchy checks on ban/mute/kick"
```

---

### Task 8: Fix PermissionFlagsBits magic number + poll vote bounds check

**Files:**
- Modify: `src/listeners/messages/messageCreate.ts`
- Modify: `src/interaction-handlers/pollVoteButtons.ts`

- [ ] **Step 1: Replace BigInt(8) with PermissionFlagsBits.Administrator**

In `src/listeners/messages/messageCreate.ts` line 43:
```ts
// OLD
if (settings.autoModEnabled && !message.member?.permissions.has(BigInt(8))) {

// NEW
import { ..., PermissionFlagsBits } from "discord.js";
// ...
if (settings.autoModEnabled && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
```

- [ ] **Step 2: Add bounds check in pollVoteButtons.ts**

Read `src/interaction-handlers/pollVoteButtons.ts` first, then add after parsing `optionIndex` from the custom ID:

```ts
const optionIndex = parseInt(parts[2] ?? "", 10);
if (isNaN(optionIndex) || optionIndex < 0) {
    return interaction.reply({ content: "Invalid poll option.", ephemeral: true });
}
// After fetching the poll:
if (optionIndex >= poll.options.length) {
    return interaction.reply({ content: "Invalid poll option.", ephemeral: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/listeners/messages/messageCreate.ts src/interaction-handlers/pollVoteButtons.ts
git commit -m "fix: use PermissionFlagsBits.Administrator, add poll option bounds check"
```

---

### Task 9: Memory-bounded caches — snipe, editSnipe, recentJoins, spamTracker

**Files:**
- Modify: `src/lib/BhayanakClient.ts`
- Modify: `src/listeners/messages/messageCreate.ts`
- Modify: `src/listeners/guild/guildMemberAdd.ts`

- [ ] **Step 1: Add a simple bounded Map helper**

In `src/lib/BhayanakClient.ts`, add a `BoundedMap` class before `BhayanakClient`:

```ts
class BoundedMap<K, V> extends Map<K, V> {
    constructor(private readonly maxSize: number) {
        super();
    }
    override set(key: K, value: V): this {
        if (this.size >= this.maxSize && !this.has(key)) {
            // Delete oldest entry
            const firstKey = this.keys().next().value;
            if (firstKey !== undefined) this.delete(firstKey);
        }
        return super.set(key, value);
    }
}
```

- [ ] **Step 2: Use BoundedMap for snipe caches**

```ts
// Replace:
public readonly snipeCache = new Map<string, SnipedMessage>();
public readonly editSnipeCache = new Map<string, EditSnipedMessage>();
// With:
public readonly snipeCache = new BoundedMap<string, SnipedMessage>(500);
public readonly editSnipeCache = new BoundedMap<string, EditSnipedMessage>(500);
```

- [ ] **Step 3: Prune spamTracker entries on expiry**

In `src/listeners/messages/messageCreate.ts`, after the spam detection block where the window resets, the entry is already deleted on trigger. But stale entries from users who stopped sending also need pruning. Add after the `spamTracker.delete(key)` on trigger (or whenever a new window starts):

```ts
// When creating a new window, the old entry is already overwritten via .set()
// For entries that never hit the threshold, prune them lazily:
if (!tracker || now > tracker.resetAt) {
    // Prune expired entries periodically (every 1000 new windows to avoid O(n) on every message)
    if (spamTracker.size > 10_000) {
        for (const [k, v] of spamTracker) {
            if (now > v.resetAt) spamTracker.delete(k);
        }
    }
    spamTracker.set(key, { count: 1, resetAt: now + 5000 });
}
```

- [ ] **Step 4: Prune recentJoins map entries**

In `src/listeners/guild/guildMemberAdd.ts`, after the join tracking block, delete the guild entry from the map when the filtered array is empty:

```ts
const filtered = (recentJoins.get(guildId) ?? []).filter((t) => now - t < window * 1000);
filtered.push(now);
if (filtered.length === 0) {
    recentJoins.delete(guildId);
} else {
    recentJoins.set(guildId, filtered);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/BhayanakClient.ts src/listeners/messages/messageCreate.ts src/listeners/guild/guildMemberAdd.ts
git commit -m "fix: bounded snipe caches, prune spamTracker and recentJoins maps"
```

---

### Task 10: DB pool error handler + Discord.js deprecation sweep

**Files:**
- Modify: `src/lib/database.ts`
- Modify: many command files (ephemeral → MessageFlags.Ephemeral)

- [ ] **Step 1: Add pool error handler**

Read `src/lib/database.ts`, then add after the pool is created:

```ts
pool.on("error", (err) => {
    // Log but don't crash — the pool will recover for subsequent queries
    console.error("[DB Pool] Idle client error:", err);
});
```

- [ ] **Step 2: Replace ephemeral: true across all commands**

Run a search to find all uses:
```bash
grep -rn "ephemeral: true" src/
```

For each file found, replace `{ ephemeral: true }` with `{ flags: MessageFlags.Ephemeral }` and add `MessageFlags` to the discord.js import if not already present.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.ts src/
git commit -m "fix: db pool error handler, replace deprecated ephemeral: true with MessageFlags.Ephemeral"
```

---

### Task 11: Fix getNextCaseNumber — atomic insert

**Files:**
- Modify: `src/db/queries/modCases.ts`

- [ ] **Step 1: Replace MAX+1 with subquery-in-INSERT**

In `src/db/queries/modCases.ts`, replace `getNextCaseNumber` and `createCase`:

```ts
export async function createCase(data: Omit<ModCaseInsert, "caseNumber" | "id">): Promise<ModCase> {
    const [created] = await db
        .insert(modCases)
        .values({
            ...data,
            caseNumber: sql`COALESCE((SELECT MAX(case_number) FROM mod_cases WHERE guild_id = ${data.guildId}), 0) + 1`,
        })
        .returning();
    return created;
}
```

Remove the `getNextCaseNumber` function entirely — it's only used by `createCase`.

- [ ] **Step 2: Commit**

```bash
git add src/db/queries/modCases.ts
git commit -m "fix(moderation): atomic case number generation using subquery-in-INSERT"
```
