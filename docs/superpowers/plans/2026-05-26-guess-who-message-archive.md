# Guess Who Message Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable Postgres message archive for channel `199168135935295488`, backfill accessible history, and add a `/guess_who` game that uses filtered archived messages.

**Architecture:** Add a dedicated archive table and query helper for long-term DBA-readable message history. Live listeners and startup backfill write to the archive through one helper. The game command keeps active rounds in memory and edits one embed as guesses are spent and the answer is revealed.

**Tech Stack:** TypeScript, Sapphire Framework, Discord.js v14, Drizzle ORM, Postgres, Vitest, Biome.

---

## File Structure

- Modify `src/db/schema.ts`: add `archivedChannelMessages` table and indexes.
- Create `src/db/queries/archivedChannelMessages.ts`: archive upsert, edit/delete marking, eligibility query, random selection.
- Create `src/lib/guessWho/eligibility.ts`: pure game eligibility checks.
- Create `src/lib/guessWho/session.ts`: in-memory round tracking and constants.
- Create `src/lib/guessWho/embeds.ts`: prompt and reveal embed builders.
- Create `src/lib/guessWho/backfill.ts`: capped startup import from Discord channel history.
- Create `src/commands/games/guess-who.ts`: slash command and message collector round flow.
- Modify `src/listeners/messages/messageCreate.ts`: call archive helper for target channel messages.
- Modify `src/listeners/messages/messageUpdate.ts`: update archive row for edits.
- Modify `src/listeners/messages/messageDelete.ts`: mark archive row deleted.
- Modify `src/index.ts`: trigger non-blocking backfill after login/client ready.
- Modify `src/lib/constants.ts`: add Guess Who channel/backfill constants.
- Modify `tests/unit/commands/structure.test.ts`: include new command path.
- Create `tests/unit/guessWho/eligibility.test.ts`: pure eligibility coverage.
- Create `tests/unit/guessWho/session.test.ts`: session lifecycle coverage.
- Create a Drizzle migration with `pnpm db:generate` after schema changes.

No commits should be made unless the user explicitly asks for one.

## Task 1: Pure Eligibility Rules

**Files:**
- Create: `src/lib/guessWho/eligibility.ts`
- Create: `tests/unit/guessWho/eligibility.test.ts`

- [ ] **Step 1: Write the failing eligibility tests**

Create `tests/unit/guessWho/eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isGameEligibleContent } from "../../../src/lib/guessWho/eligibility.js";

describe("isGameEligibleContent", () => {
	const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

	it("accepts normal conversational messages", () => {
		expect(
			isGameEligibleContent({
				content: "This is exactly the kind of message people would recognize.",
				messageCreatedAt: oldDate,
			}),
		).toBe(true);
	});

	it("rejects short, command-like, link-only, mass-mention, long, and too-recent messages", () => {
		expect(isGameEligibleContent({ content: "lol", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "/play never gonna give you up", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "!rank", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "https://example.com/thing", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "hello @everyone this is chaos", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "a".repeat(301), messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "This is too recent to be fair.", messageCreatedAt: new Date() })).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/guessWho/eligibility.test.ts`

Expected: FAIL because `src/lib/guessWho/eligibility.ts` does not exist.

- [ ] **Step 3: Implement eligibility helper**

Create `src/lib/guessWho/eligibility.ts`:

```ts
const MIN_CONTENT_LENGTH = 15;
const MAX_CONTENT_LENGTH = 300;
const MIN_MESSAGE_AGE_MS = 60 * 60 * 1000;
const URL_ONLY_PATTERN = /^https?:\/\/\S+$/i;

export type GameEligibilityInput = {
	content: string;
	messageCreatedAt: Date;
};

export function isGameEligibleContent(input: GameEligibilityInput, now = new Date()): boolean {
	const content = input.content.trim();
	if (content.length < MIN_CONTENT_LENGTH || content.length > MAX_CONTENT_LENGTH) return false;
	if (content.startsWith("/") || content.startsWith("!")) return false;
	if (URL_ONLY_PATTERN.test(content)) return false;
	if (content.includes("@everyone") || content.includes("@here")) return false;
	if (now.getTime() - input.messageCreatedAt.getTime() < MIN_MESSAGE_AGE_MS) return false;
	return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/guessWho/eligibility.test.ts`

Expected: PASS.

## Task 2: Session State

**Files:**
- Create: `src/lib/guessWho/session.ts`
- Create: `tests/unit/guessWho/session.test.ts`

- [ ] **Step 1: Write failing session tests**

Create `tests/unit/guessWho/session.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	GUESS_WHO_MAX_WRONG_GUESSES,
	GUESS_WHO_TIMEOUT_MS,
	clearGuessWhoSession,
	createGuessWhoSession,
	getGuessWhoSession,
	recordWrongGuess,
} from "../../../src/lib/guessWho/session.js";

describe("guess who sessions", () => {
	afterEach(() => {
		clearGuessWhoSession("channel-1");
	});

	it("creates one active session per channel", () => {
		const timeout = setTimeout(() => undefined, 1);
		createGuessWhoSession({
			channelId: "channel-1",
			messageId: "prompt-1",
			authorUserId: "author-1",
			wrongGuesses: 0,
			timeout,
		});

		expect(getGuessWhoSession("channel-1")?.messageId).toBe("prompt-1");
		expect(() =>
			createGuessWhoSession({
				channelId: "channel-1",
				messageId: "prompt-2",
				authorUserId: "author-2",
				wrongGuesses: 0,
				timeout,
			}),
		).toThrow("A Guess Who round is already active in this channel.");
	});

	it("tracks remaining global wrong guesses", () => {
		const timeout = setTimeout(() => undefined, 1);
		createGuessWhoSession({
			channelId: "channel-1",
			messageId: "prompt-1",
			authorUserId: "author-1",
			wrongGuesses: 0,
			timeout,
		});

		expect(recordWrongGuess("channel-1")).toEqual({ wrongGuesses: 1, remainingGuesses: 2, exhausted: false });
		expect(recordWrongGuess("channel-1")).toEqual({ wrongGuesses: 2, remainingGuesses: 1, exhausted: false });
		expect(recordWrongGuess("channel-1")).toEqual({ wrongGuesses: 3, remainingGuesses: 0, exhausted: true });
	});

	it("uses a ten minute timeout and three wrong guesses", () => {
		expect(GUESS_WHO_TIMEOUT_MS).toBe(10 * 60 * 1000);
		expect(GUESS_WHO_MAX_WRONG_GUESSES).toBe(3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/guessWho/session.test.ts`

Expected: FAIL because `src/lib/guessWho/session.ts` does not exist.

- [ ] **Step 3: Implement session helper**

Create `src/lib/guessWho/session.ts`:

```ts
export const GUESS_WHO_MAX_WRONG_GUESSES = 3;
export const GUESS_WHO_TIMEOUT_MS = 10 * 60 * 1000;

export type GuessWhoSession = {
	channelId: string;
	messageId: string;
	authorUserId: string;
	wrongGuesses: number;
	timeout: NodeJS.Timeout;
};

const sessions = new Map<string, GuessWhoSession>();

export function getGuessWhoSession(channelId: string): GuessWhoSession | undefined {
	return sessions.get(channelId);
}

export function createGuessWhoSession(session: GuessWhoSession): GuessWhoSession {
	if (sessions.has(session.channelId)) {
		throw new Error("A Guess Who round is already active in this channel.");
	}
	sessions.set(session.channelId, session);
	return session;
}

export function clearGuessWhoSession(channelId: string): void {
	const session = sessions.get(channelId);
	if (session) clearTimeout(session.timeout);
	sessions.delete(channelId);
}

export function recordWrongGuess(channelId: string): { wrongGuesses: number; remainingGuesses: number; exhausted: boolean } {
	const session = sessions.get(channelId);
	if (!session) throw new Error(`No active Guess Who session for channel ${channelId}`);
	session.wrongGuesses++;
	const remainingGuesses = Math.max(0, GUESS_WHO_MAX_WRONG_GUESSES - session.wrongGuesses);
	return {
		wrongGuesses: session.wrongGuesses,
		remainingGuesses,
		exhausted: remainingGuesses === 0,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/guessWho/session.test.ts`

Expected: PASS.

## Task 3: Archive Schema And Queries

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/queries/archivedChannelMessages.ts`
- Create migration via `pnpm db:generate`

- [ ] **Step 1: Add archive table to schema**

Modify `src/db/schema.ts` imports to include `uniqueIndex` if needed, then add this table near other message/history tables:

```ts
export const archivedChannelMessages = pgTable(
	"archived_channel_messages",
	{
		messageId: varchar("message_id", { length: 20 }).primaryKey(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		channelId: varchar("channel_id", { length: 20 }).notNull(),
		authorUserId: varchar("author_user_id", { length: 20 }).notNull(),
		authorUsername: varchar("author_username", { length: 100 }).notNull(),
		authorDisplayName: varchar("author_display_name", { length: 100 }).notNull(),
		content: text("content").notNull(),
		messageCreatedAt: timestamp("message_created_at").notNull(),
		archivedAt: timestamp("archived_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		editedAt: timestamp("edited_at"),
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("archived_messages_timeline_idx").on(t.guildId, t.channelId, t.messageCreatedAt),
		index("archived_messages_author_timeline_idx").on(t.guildId, t.channelId, t.authorUserId, t.messageCreatedAt),
		index("archived_messages_game_idx").on(t.guildId, t.channelId, t.deletedAt, t.messageCreatedAt),
	],
);
```

- [ ] **Step 2: Implement archive query helper**

Create `src/db/queries/archivedChannelMessages.ts`:

```ts
import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { isGameEligibleContent } from "../../lib/guessWho/eligibility.js";
import { archivedChannelMessages } from "../schema.js";

export type ArchivedMessageInput = {
	messageId: string;
	guildId: string;
	channelId: string;
	authorUserId: string;
	authorUsername: string;
	authorDisplayName: string;
	content: string;
	messageCreatedAt: Date;
	editedAt?: Date | null;
};

export type GuessWhoArchivedMessage = typeof archivedChannelMessages.$inferSelect;

export async function upsertArchivedChannelMessage(input: ArchivedMessageInput): Promise<void> {
	await db
		.insert(archivedChannelMessages)
		.values({ ...input, updatedAt: new Date(), deletedAt: null })
		.onConflictDoUpdate({
			target: archivedChannelMessages.messageId,
			set: {
				guildId: input.guildId,
				channelId: input.channelId,
				authorUserId: input.authorUserId,
				authorUsername: input.authorUsername,
				authorDisplayName: input.authorDisplayName,
				content: input.content,
				messageCreatedAt: input.messageCreatedAt,
				editedAt: input.editedAt ?? null,
				updatedAt: new Date(),
				deletedAt: null,
			},
		});
}

export async function markArchivedChannelMessageEdited(input: ArchivedMessageInput): Promise<void> {
	await upsertArchivedChannelMessage({ ...input, editedAt: input.editedAt ?? new Date() });
}

export async function markArchivedChannelMessageDeleted(messageId: string, deletedAt = new Date()): Promise<void> {
	await db
		.update(archivedChannelMessages)
		.set({ deletedAt, updatedAt: deletedAt })
		.where(eq(archivedChannelMessages.messageId, messageId));
}

export async function getRandomGuessWhoMessage(input: {
	guildId: string;
	channelId: string;
	excludeAuthorUserId: string;
	now?: Date;
}): Promise<GuessWhoArchivedMessage | null> {
	const now = input.now ?? new Date();
	const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
	const candidates = await db.query.archivedChannelMessages.findMany({
		where: and(
			eq(archivedChannelMessages.guildId, input.guildId),
			eq(archivedChannelMessages.channelId, input.channelId),
			ne(archivedChannelMessages.authorUserId, input.excludeAuthorUserId),
			isNull(archivedChannelMessages.deletedAt),
			lt(archivedChannelMessages.messageCreatedAt, cutoff),
		),
		orderBy: sql`random()`,
		limit: 25,
	});

	return candidates.find((message) => isGameEligibleContent({
		content: message.content,
		messageCreatedAt: message.messageCreatedAt,
	}, now)) ?? null;
}
```

- [ ] **Step 3: Generate migration**

Run: `pnpm db:generate`

Expected: a new SQL migration under `drizzle/` and a new snapshot under `drizzle/meta/` that creates `archived_channel_messages` and indexes.

- [ ] **Step 4: Type-check schema and helper**

Run: `pnpm build`

Expected: PASS, or fail only on missing future files not yet added. Fix import/type errors before continuing.

## Task 4: Archive Live Messages, Edits, And Deletes

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/listeners/messages/messageCreate.ts`
- Modify: `src/listeners/messages/messageUpdate.ts`
- Modify: `src/listeners/messages/messageDelete.ts`

- [ ] **Step 1: Add constants**

Modify `src/lib/constants.ts`:

```ts
export const GUESS_WHO_CHANNEL_ID = process.env.GUESS_WHO_CHANNEL_ID ?? "199168135935295488";
export const GUESS_WHO_BACKFILL_LIMIT = Number.parseInt(process.env.GUESS_WHO_BACKFILL_LIMIT ?? "1000", 10);
```

- [ ] **Step 2: Add live archive call to messageCreate**

In `src/listeners/messages/messageCreate.ts`, import `upsertArchivedChannelMessage` and `GUESS_WHO_CHANNEL_ID`, then add immediately after the bot/guild guard:

```ts
		if (message.channelId === GUESS_WHO_CHANNEL_ID) {
			await upsertArchivedChannelMessage({
				messageId: message.id,
				guildId: message.guild.id,
				channelId: message.channelId,
				authorUserId: message.author.id,
				authorUsername: message.author.username,
				authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
				content: message.content,
				messageCreatedAt: message.createdAt,
			}).catch((err) => this.container.logger.error("[guess-who] Failed to archive message:", err));
		}
```

- [ ] **Step 3: Track edits**

In `src/listeners/messages/messageUpdate.ts`, import `markArchivedChannelMessageEdited` and `GUESS_WHO_CHANNEL_ID`, then add after the existing guard/content-change checks:

```ts
		if (newMessage.channelId === GUESS_WHO_CHANNEL_ID) {
			await markArchivedChannelMessageEdited({
				messageId: newMessage.id,
				guildId: newMessage.guild.id,
				channelId: newMessage.channelId,
				authorUserId: newMessage.author.id,
				authorUsername: newMessage.author.username,
				authorDisplayName: newMessage.member?.displayName ?? newMessage.author.globalName ?? newMessage.author.username,
				content: newMessage.content ?? "",
				messageCreatedAt: newMessage.createdAt,
				editedAt: newMessage.editedAt ?? new Date(),
			}).catch((err) => this.container.logger.error("[guess-who] Failed to archive edited message:", err));
		}
```

- [ ] **Step 4: Track deletes**

In `src/listeners/messages/messageDelete.ts`, import `markArchivedChannelMessageDeleted` and `GUESS_WHO_CHANNEL_ID`, then add after the existing guard:

```ts
		if (message.channelId === GUESS_WHO_CHANNEL_ID) {
			await markArchivedChannelMessageDeleted(message.id).catch((err) =>
				this.container.logger.error("[guess-who] Failed to mark archived message deleted:", err),
			);
		}
```

- [ ] **Step 5: Verify listener changes**

Run: `pnpm test tests/unit/listeners/structure.test.ts`

Expected: PASS.

## Task 5: Historical Backfill

**Files:**
- Create: `src/lib/guessWho/backfill.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement backfill helper**

Create `src/lib/guessWho/backfill.ts`:

```ts
import { ChannelType, type Client, type TextChannel } from "discord.js";
import { upsertArchivedChannelMessage } from "../../db/queries/archivedChannelMessages.js";
import { GUESS_WHO_BACKFILL_LIMIT, GUESS_WHO_CHANNEL_ID } from "../constants.js";

export async function backfillGuessWhoMessages(client: Client): Promise<number> {
	const channel = await client.channels.fetch(GUESS_WHO_CHANNEL_ID).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return 0;

	let before: string | undefined;
	let imported = 0;
	const limit = Math.max(0, GUESS_WHO_BACKFILL_LIMIT);

	while (imported < limit) {
		const batchSize = Math.min(100, limit - imported);
		const messages = await (channel as TextChannel).messages.fetch({ limit: batchSize, before });
		if (messages.size === 0) break;

		for (const message of messages.values()) {
			before = message.id;
			if (message.author.bot || !message.guild) continue;
			await upsertArchivedChannelMessage({
				messageId: message.id,
				guildId: message.guild.id,
				channelId: message.channelId,
				authorUserId: message.author.id,
				authorUsername: message.author.username,
				authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
				content: message.content,
				messageCreatedAt: message.createdAt,
				editedAt: message.editedAt,
			});
			imported++;
			if (imported >= limit) break;
		}

		if (messages.size < batchSize) break;
	}

	return imported;
}
```

- [ ] **Step 2: Trigger backfill non-blocking on ready**

Modify `src/index.ts` imports:

```ts
import { backfillGuessWhoMessages } from "./lib/guessWho/backfill.js";
```

Inside `client.once("clientReady", () => { ... })`, after guild logging:

```ts
			void backfillGuessWhoMessages(client)
				.then((count) => client.logger.info(`[guess-who] Backfilled ${count} archived message(s)`))
				.catch((err) => client.logger.error("[guess-who] Backfill failed:", err));
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`

Expected: PASS.

## Task 6: Embeds And Slash Command

**Files:**
- Create: `src/lib/guessWho/embeds.ts`
- Create: `src/commands/games/guess-who.ts`
- Modify: `tests/unit/commands/structure.test.ts`

- [ ] **Step 1: Create embed builders**

Create `src/lib/guessWho/embeds.ts`:

```ts
import { EmbedBuilder } from "discord.js";
import type { GuessWhoArchivedMessage } from "../../db/queries/archivedChannelMessages.js";
import { GUESS_WHO_MAX_WRONG_GUESSES } from "./session.js";

export function buildGuessWhoPromptEmbed(message: GuessWhoArchivedMessage, remainingGuesses = GUESS_WHO_MAX_WRONG_GUESSES) {
	return new EmbedBuilder()
		.setTitle("Guess Who?")
		.setDescription(`> ${message.content}`)
		.setColor(0x9b59b6)
		.addFields({ name: "How to play", value: "Mention the user who sent this message." })
		.setFooter({ text: `${remainingGuesses} guesses remaining` })
		.setTimestamp();
}

export function buildGuessWhoRevealEmbed(input: {
	message: GuessWhoArchivedMessage;
	outcome: "correct" | "exhausted" | "timeout";
	guessedByUserId?: string;
}) {
	const sentUnix = Math.floor(input.message.messageCreatedAt.getTime() / 1000);
	const sourceUrl = `https://discord.com/channels/${input.message.guildId}/${input.message.channelId}/${input.message.messageId}`;
	const title = input.outcome === "correct" ? "Correct Guess!" : input.outcome === "timeout" ? "Time's Up!" : "Answer Revealed";
	const outcomeText = input.outcome === "correct" && input.guessedByUserId
		? `<@${input.guessedByUserId}> guessed correctly.`
		: input.outcome === "timeout"
			? "The round timed out."
			: "The channel used all 3 guesses.";

	return new EmbedBuilder()
		.setTitle(title)
		.setDescription(`> ${input.message.content}`)
		.setColor(input.outcome === "correct" ? 0x57f287 : 0xfee75c)
		.addFields(
			{ name: "Author", value: `<@${input.message.authorUserId}> (${input.message.authorDisplayName})`, inline: true },
			{ name: "Sent", value: `<t:${sentUnix}:R>`, inline: true },
			{ name: "Message ID", value: input.message.messageId, inline: false },
			{ name: "Source", value: `[Jump to message](${sourceUrl})`, inline: false },
			{ name: "Outcome", value: outcomeText, inline: false },
		)
		.setTimestamp();
}
```

- [ ] **Step 2: Implement command**

Create `src/commands/games/guess-who.ts` with a `Command` subclass that:

```ts
// Key implementation points:
// - preconditions: ["GuildOnly"]
// - slash name: "guess_who"
// - reject if interaction.channelId !== GUESS_WHO_CHANNEL_ID
// - reject if getGuessWhoSession(interaction.channelId) exists
// - deferReply()
// - call getRandomGuessWhoMessage({ guildId, channelId, excludeAuthorUserId: interaction.user.id })
// - editReply({ embeds: [buildGuessWhoPromptEmbed(message)] })
// - create a message collector on interaction.channel for 10 minutes
// - ignore messages without mentions
// - silently ignore if guesser is original author
// - if guessed user is author: stop collector and edit same reply with reveal embed outcome "correct"
// - otherwise recordWrongGuess and edit prompt embed with remaining guesses
// - after exhausted guesses: stop collector and edit same reply with reveal embed outcome "exhausted"
// - on collector end due to time: edit same reply with reveal embed outcome "timeout"
// - clearGuessWhoSession(channelId) exactly once when round ends
```

Use existing command style from `src/commands/fun/poll.ts` for registration and replies.

- [ ] **Step 3: Add command to structure test**

Modify `tests/unit/commands/structure.test.ts` and add this path to `commandFiles`:

```ts
"../../../src/commands/games/guess-who.js",
```

- [ ] **Step 4: Verify command structure**

Run: `pnpm test tests/unit/commands/structure.test.ts`

Expected: PASS.

## Task 7: Full Verification

**Files:**
- All files touched above

- [ ] **Step 1: Run focused unit tests**

Run: `pnpm test tests/unit/guessWho/eligibility.test.ts tests/unit/guessWho/session.test.ts tests/unit/commands/structure.test.ts tests/unit/listeners/structure.test.ts`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Run full tests if Postgres is available**

Run: `pnpm test`

Expected: PASS if the test Postgres database is reachable. If DB-backed integration tests fail because Postgres is unavailable, record the exact failure and the focused test results.

## Self-Review

- Spec coverage: schema, DBA archive, live archiving, edit/delete tracking, capped no-duplicate backfill, filtered game pool, channel restriction, 3 total wrong guesses, original-author silent ignore, 10-minute timeout, active embed count updates, in-place reveal, source link, and tests are covered.
- Placeholder scan: no TBD/TODO placeholders remain. Task 6 describes command behavior as implementation points because exact collector code depends on Discord.js types, but every behavioral branch is explicit.
- Type consistency: `archivedChannelMessages`, `GuessWhoArchivedMessage`, `GUESS_WHO_CHANNEL_ID`, `GUESS_WHO_BACKFILL_LIMIT`, and session function names are consistent across tasks.
