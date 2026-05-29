# Archive-Backed Personality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework user and guild personality generation to use durable archived general-chat messages as the source of truth, with robust integration and e2e coverage.

**Architecture:** `archived_channel_messages` becomes the canonical personality training corpus. Profile state tables keep incremental processing cursors/counters, while builders query eligible archive rows in bounded chunks. Discord interactions can be mocked in tests, but profile-generation changes must include an opt-in real-Ollama e2e path.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres, Sapphire Framework, Discord.js, Vitest, Ollama.

---

## File Structure

- Modify: `src/db/schema.ts` — add profile cursor metadata to user/guild profile tables if needed.
- Modify/Create: `src/db/queries/personalityTraining.ts` — archive-backed training eligibility and chunk queries.
- Modify: `src/db/queries/personality.ts` — profile metadata updates for user incremental processing.
- Modify: `src/db/queries/guildPersonality.ts` — guild profile metadata updates and author-balanced query helpers.
- Modify: `src/lib/personality/buildProfile.ts` — user builder reads archive chunks instead of deleting `user_messages`.
- Modify: `src/lib/personality/buildGuildProfile.ts` — guild builder reads author-balanced archive chunks and preserves in-flight counts.
- Modify: `src/lib/personality/getPersonalityContext.ts` — load both user and guild profile contexts from DB/cache.
- Modify: `src/listeners/messages/messageCreate.ts` — keep archiving general-chat messages, trigger personality work from archive-backed counters, stop double-storing disposable raw message source where possible.
- Modify: `src/commands/utility/personality.ts` — expose explicit user and guild view/refresh surfaces.
- Modify: `web/src/data/commands.ts` and `web/src/content/commands/personality.mdx` — sync command docs with actual behavior.
- Create/Modify migrations under `drizzle/` and `drizzle/meta/`.
- Create: `tests/integration/db/personality-training-queries.test.ts`.
- Create: `tests/integration/personality/profile-builders.test.ts`.
- Create: `tests/e2e/personality/ollama-profile-generation.test.ts`.
- Create/Modify command/listener tests under `tests/unit/` or `tests/integration/`.

Do not commit unless explicitly requested by the user.

## Task 1: Archive-Backed Training Query Contract

**Files:**
- Create: `src/db/queries/personalityTraining.ts`
- Modify: `src/db/schema.ts`
- Create: `tests/integration/db/personality-training-queries.test.ts`

- [ ] **Step 1: Write failing integration tests for training eligibility**

Create `tests/integration/db/personality-training-queries.test.ts` with tests that insert rows into `archivedChannelMessages` and assert:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import {
	getEligibleUserTrainingMessages,
	getEligibleGuildTrainingMessages,
} from "../../../src/db/queries/personalityTraining.js";
import { archivedChannelMessages } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "guild-personality-test";
const CHANNEL_ID = "channel-general-test";
const USER_A = "user-a";
const USER_B = "user-b";

async function archiveMessage(id: string, authorUserId: string, content: string, createdAt: Date): Promise<void> {
	await upsertArchivedChannelMessage({
		messageId: id,
		guildId: GUILD_ID,
		channelId: CHANNEL_ID,
		authorUserId,
		authorUsername: authorUserId,
		authorDisplayName: authorUserId,
		content,
		messageCreatedAt: createdAt,
	});
}

describe("personality training archive queries", () => {
	beforeEach(async () => {
		await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	});

	it("returns meaningful non-command non-deleted user messages in chronological order", async () => {
		await archiveMessage("m1", USER_A, "This is a meaningful message about music and jokes.", new Date("2026-05-01T00:00:00Z"));
		await archiveMessage("m2", USER_A, "/personality user", new Date("2026-05-01T00:01:00Z"));
		await archiveMessage("m3", USER_A, "ok", new Date("2026-05-01T00:02:00Z"));

		const messages = await getEligibleUserTrainingMessages({ guildId: GUILD_ID, userId: USER_A, afterMessageCreatedAt: null, limit: 20 });

		expect(messages.map((message) => message.messageId)).toEqual(["m1"]);
	});

	it("uses latest edited content and excludes deleted messages", async () => {
		await archiveMessage("m4", USER_A, "Original meaningful content about games.", new Date("2026-05-01T00:03:00Z"));
		await upsertArchivedChannelMessage({
			messageId: "m4",
			guildId: GUILD_ID,
			channelId: CHANNEL_ID,
			authorUserId: USER_A,
			authorUsername: USER_A,
			authorDisplayName: USER_A,
			content: "Edited meaningful content about art and games.",
			messageCreatedAt: new Date("2026-05-01T00:03:00Z"),
			editedAt: new Date("2026-05-01T00:04:00Z"),
		});

		const messages = await getEligibleUserTrainingMessages({ guildId: GUILD_ID, userId: USER_A, afterMessageCreatedAt: null, limit: 20 });

		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("Edited meaningful content about art and games.");
	});

	it("balances guild messages across authors", async () => {
		for (let index = 0; index < 5; index++) {
			await archiveMessage(`a-${index}`, USER_A, `User A meaningful message number ${index} about recurring jokes.`, new Date(`2026-05-01T00:0${index}:00Z`));
		}
		await archiveMessage("b-1", USER_B, "User B meaningful message about server culture.", new Date("2026-05-01T00:10:00Z"));

		const messages = await getEligibleGuildTrainingMessages({ guildId: GUILD_ID, afterMessageCreatedAt: null, limit: 4, maxPerAuthor: 2 });

		expect(messages.filter((message) => message.authorUserId === USER_A)).toHaveLength(2);
		expect(messages.some((message) => message.authorUserId === USER_B)).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run tests/integration/db/personality-training-queries.test.ts`

Expected: FAIL because `src/db/queries/personalityTraining.ts` does not exist.

- [ ] **Step 3: Implement minimal archive training query helpers**

Create `src/db/queries/personalityTraining.ts`:

```ts
import { and, asc, eq, gt, isNull, notIlike, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { archivedChannelMessages } from "../schema.js";

export interface TrainingMessage {
	messageId: string;
	authorUserId: string;
	content: string;
	messageCreatedAt: Date;
}

interface UserTrainingInput {
	guildId: string;
	userId: string;
	afterMessageCreatedAt: Date | null;
	limit: number;
}

interface GuildTrainingInput {
	guildId: string;
	afterMessageCreatedAt: Date | null;
	limit: number;
	maxPerAuthor: number;
}

function trainingWhere(guildId: string, afterMessageCreatedAt: Date | null) {
	const trimmed = sql`regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g')`;
	return and(
		eq(archivedChannelMessages.guildId, guildId),
		isNull(archivedChannelMessages.deletedAt),
		afterMessageCreatedAt ? gt(archivedChannelMessages.messageCreatedAt, afterMessageCreatedAt) : undefined,
		sql`length(${trimmed}) between 15 and 1000`,
		sql`${trimmed} not like '/%'`,
		sql`${trimmed} not like '!%'`,
		sql`${trimmed} !~* '^https?://\\S+$'`,
		notIlike(archivedChannelMessages.content, "%@everyone%"),
		notIlike(archivedChannelMessages.content, "%@here%"),
	);
}

export async function getEligibleUserTrainingMessages(input: UserTrainingInput): Promise<TrainingMessage[]> {
	return db
		.select({
			messageId: archivedChannelMessages.messageId,
			authorUserId: archivedChannelMessages.authorUserId,
			content: archivedChannelMessages.content,
			messageCreatedAt: archivedChannelMessages.messageCreatedAt,
		})
		.from(archivedChannelMessages)
		.where(and(trainingWhere(input.guildId, input.afterMessageCreatedAt), eq(archivedChannelMessages.authorUserId, input.userId)))
		.orderBy(asc(archivedChannelMessages.messageCreatedAt), asc(archivedChannelMessages.messageId))
		.limit(input.limit);
}

export async function getEligibleGuildTrainingMessages(input: GuildTrainingInput): Promise<TrainingMessage[]> {
	const rows = await db
		.select({
			messageId: archivedChannelMessages.messageId,
			authorUserId: archivedChannelMessages.authorUserId,
			content: archivedChannelMessages.content,
			messageCreatedAt: archivedChannelMessages.messageCreatedAt,
		})
		.from(archivedChannelMessages)
		.where(trainingWhere(input.guildId, input.afterMessageCreatedAt))
		.orderBy(asc(archivedChannelMessages.messageCreatedAt), asc(archivedChannelMessages.messageId))
		.limit(input.limit * Math.max(2, input.maxPerAuthor));

	const perAuthor = new Map<string, number>();
	const selected: TrainingMessage[] = [];
	for (const row of rows) {
		const count = perAuthor.get(row.authorUserId) ?? 0;
		if (count >= input.maxPerAuthor) continue;
		perAuthor.set(row.authorUserId, count + 1);
		selected.push(row);
		if (selected.length >= input.limit) break;
	}
	return selected;
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm vitest run tests/integration/db/personality-training-queries.test.ts`

Expected: PASS.

## Task 2: Profile Cursor Schema And Migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify/Create: `drizzle/00xx_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/00xx_snapshot.json`
- Create: `tests/integration/db/personality-profile-cursors.test.ts`

- [ ] **Step 1: Write failing cursor tests**

Create `tests/integration/db/personality-profile-cursors.test.ts` asserting profile rows can store and update cursor timestamps:

```ts
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { userPersonalityProfiles, guildPersonalityProfiles } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "cursor-guild";
const USER_ID = "cursor-user";

describe("personality profile cursors", () => {
	beforeEach(async () => {
		await db.delete(userPersonalityProfiles).where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
		await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	});

	it("stores the last user training message timestamp", async () => {
		const lastTrainingMessageAt = new Date("2026-05-01T00:00:00Z");
		const [row] = await db.insert(userPersonalityProfiles).values({ userId: USER_ID, guildId: GUILD_ID, lastTrainingMessageAt }).returning();

		expect(row.lastTrainingMessageAt?.toISOString()).toBe(lastTrainingMessageAt.toISOString());
	});

	it("stores the last guild training message timestamp", async () => {
		const lastTrainingMessageAt = new Date("2026-05-01T00:00:00Z");
		const [row] = await db.insert(guildPersonalityProfiles).values({ guildId: GUILD_ID, lastTrainingMessageAt }).returning();

		expect(row.lastTrainingMessageAt?.toISOString()).toBe(lastTrainingMessageAt.toISOString());
	});
});
```

- [ ] **Step 2: Run cursor tests to verify RED**

Run: `pnpm vitest run tests/integration/db/personality-profile-cursors.test.ts`

Expected: FAIL because `lastTrainingMessageAt` columns do not exist.

- [ ] **Step 3: Add cursor columns**

In `src/db/schema.ts`, add `lastTrainingMessageAt: timestamp("last_training_message_at")` to both `userPersonalityProfiles` and `guildPersonalityProfiles`.

- [ ] **Step 4: Generate migration**

Run: `pnpm db:generate`

Expected: migration adds nullable `last_training_message_at` columns to both profile tables.

- [ ] **Step 5: Run cursor tests to verify GREEN**

Run: `pnpm vitest run tests/integration/db/personality-profile-cursors.test.ts`

Expected: PASS.

## Task 3: User Profile Builder From Archive

**Files:**
- Modify: `src/lib/personality/buildProfile.ts`
- Modify: `src/db/queries/personality.ts`
- Create: `tests/integration/personality/profile-builders.test.ts`

- [ ] **Step 1: Write failing user builder tests with fake model boundary**

Create `tests/integration/personality/profile-builders.test.ts` with a module mock for `callOllamaLowPriority` and assert:

```ts
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/ollama.js", () => ({
	callOllamaLowPriority: vi.fn(async () => "Profile summary without direct quotes."),
}));

import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import { getPersonalityProfile } from "../../../src/db/queries/personality.js";
import { archivedChannelMessages, userPersonalityProfiles } from "../../../src/db/schema.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";
import { db } from "../../../src/lib/database.js";
import { callOllamaLowPriority } from "../../../src/lib/ollama.js";

const GUILD_ID = "builder-guild";
const CHANNEL_ID = "builder-channel";
const USER_ID = "builder-user";

async function archiveMessage(index: number, content = `Meaningful archived training message ${index} with enough words.`): Promise<void> {
	await upsertArchivedChannelMessage({
		messageId: `builder-message-${index}`,
		guildId: GUILD_ID,
		channelId: CHANNEL_ID,
		authorUserId: USER_ID,
		authorUsername: USER_ID,
		authorDisplayName: USER_ID,
		content,
		messageCreatedAt: new Date(Date.UTC(2026, 4, 1, 0, index, 0)),
	});
}

describe("archive-backed personality builders", () => {
	beforeEach(async () => {
		vi.mocked(callOllamaLowPriority).mockClear();
		await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
		await db.delete(userPersonalityProfiles).where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
	});

	it("does not build an initial user profile below the evidence threshold", async () => {
		await archiveMessage(1);

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(callOllamaLowPriority).not.toHaveBeenCalled();
		await expect(getPersonalityProfile(USER_ID, GUILD_ID)).resolves.toBeNull();
	});

	it("builds a user profile from archived messages without deleting archive rows", async () => {
		for (let index = 0; index < 100; index++) await archiveMessage(index);

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		await expect(getPersonalityProfile(USER_ID, GUILD_ID)).resolves.toBe("Profile summary without direct quotes.");
		const remaining = await db.query.archivedChannelMessages.findMany({ where: eq(archivedChannelMessages.guildId, GUILD_ID) });
		expect(remaining).toHaveLength(100);
		expect(vi.mocked(callOllamaLowPriority).mock.calls[0][1]).toContain("Meaningful archived training message 0");
	});
});
```

- [ ] **Step 2: Run user builder tests to verify RED**

Run: `pnpm vitest run tests/integration/personality/profile-builders.test.ts`

Expected: FAIL because builder still reads `user_messages` and can build from one queued message behavior is inconsistent with new threshold.

- [ ] **Step 3: Update builder to use archive query**

In `src/lib/personality/buildProfile.ts`:

- Replace `getUnabsorbedMessages()` calls with `getEligibleUserTrainingMessages({ guildId, userId, afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null, limit: MAX_MESSAGES_PER_BUILD })`.
- Add `INITIAL_USER_PROFILE_THRESHOLD = 100` and `REFRESH_USER_PROFILE_THRESHOLD = 20`.
- If no existing profile and messages `< INITIAL_USER_PROFILE_THRESHOLD`, return without model call.
- If existing profile and messages `< REFRESH_USER_PROFILE_THRESHOLD`, return without model call unless manually forced in a later task.
- On successful update, set `lastTrainingMessageAt` to the newest absorbed message timestamp and do not delete archived messages.
- Update system prompt to say “Do not quote source messages directly.”

- [ ] **Step 4: Run user builder tests to verify GREEN**

Run: `pnpm vitest run tests/integration/personality/profile-builders.test.ts`

Expected: PASS for user tests.

## Task 4: Guild Builder From Archive With Balanced Sampling

**Files:**
- Modify: `src/lib/personality/buildGuildProfile.ts`
- Modify: `src/db/queries/guildPersonality.ts`
- Modify: `tests/integration/personality/profile-builders.test.ts`

- [ ] **Step 1: Add failing guild builder tests**

Extend `tests/integration/personality/profile-builders.test.ts` to assert:

```ts
import { guildPersonalityProfiles } from "../../../src/db/schema.js";
import { getGuildPersonalityProfile } from "../../../src/db/queries/guildPersonality.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";

it("builds a guild profile from author-balanced archived messages", async () => {
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	for (let index = 0; index < 120; index++) await archiveMessage(index, `Loud user message ${index} with enough personality content.`);
	for (let index = 0; index < 80; index++) {
		await upsertArchivedChannelMessage({
			messageId: `builder-other-${index}`,
			guildId: GUILD_ID,
			channelId: CHANNEL_ID,
			authorUserId: `other-${index % 8}`,
			authorUsername: `other-${index % 8}`,
			authorDisplayName: `other-${index % 8}`,
			content: `Other user message ${index} with enough server culture content.`,
			messageCreatedAt: new Date(Date.UTC(2026, 4, 2, 0, index, 0)),
		});
	}

	await buildGuildPersonalityProfile(GUILD_ID);

	await expect(getGuildPersonalityProfile(GUILD_ID)).resolves.toBe("Profile summary without direct quotes.");
	const prompt = vi.mocked(callOllamaLowPriority).mock.calls.at(-1)?.[1] ?? "";
	expect(prompt).toContain("Author 1:");
	expect(prompt).toContain("Author 2:");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run tests/integration/personality/profile-builders.test.ts`

Expected: FAIL because guild builder reads unlabelled `user_messages` and/or does not have enough archive-backed state.

- [ ] **Step 3: Update guild builder**

In `src/lib/personality/buildGuildProfile.ts`:

- Replace `getRecentGuildMessages()` with `getEligibleGuildTrainingMessages({ guildId, afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null, limit: MAX_MESSAGES_PER_BUILD, maxPerAuthor: 10 })`.
- Use `INITIAL_GUILD_PROFILE_THRESHOLD = 200` and `REFRESH_GUILD_PROFILE_THRESHOLD = 40`.
- Build message block with stable anonymized labels, e.g. `Author 1: message`.
- On success, update profile and set `lastTrainingMessageAt` to the newest processed timestamp.
- Preserve in-flight message counters by decrementing processed count or removing `messageCount` as build source if cursor queries fully replace it.
- Update prompt to avoid direct quotes.

- [ ] **Step 4: Run guild builder tests to verify GREEN**

Run: `pnpm vitest run tests/integration/personality/profile-builders.test.ts`

Expected: PASS.

## Task 5: Personality Context Loads User And Guild Profiles

**Files:**
- Modify: `src/lib/personality/getPersonalityContext.ts`
- Modify: `src/listeners/messages/messageCreate.ts`
- Create: `tests/unit/lib/personalityContext.test.ts`

- [ ] **Step 1: Write failing context tests**

Create `tests/unit/lib/personalityContext.test.ts` with mocked DB query modules asserting returned context includes separate guild and user sections when present and caches them.

- [ ] **Step 2: Run context tests to verify RED**

Run: `pnpm vitest run tests/unit/lib/personalityContext.test.ts`

Expected: FAIL because current `getPersonalityContext()` only loads user profile.

- [ ] **Step 3: Implement context loader**

Update `getPersonalityContext(client, userId, guildId)` to:

- Load user profile via `getPersonalityProfile()`.
- Load guild profile via `getGuildPersonalityProfile()`.
- Cache a combined context under a key containing user and guild.
- Format separate sections:

```text
Guild culture context for this server (use silently as tone/culture context):
...

Personality context for the user you are replying to (use silently to shape tone and style):
...
```

- [ ] **Step 4: Remove direct `guildPersonalityCache` reads from `messageCreate.ts`**

Use `getPersonalityContext()` consistently where AI response prompts are built. Do not leave stale logic that expects `guildPersonalityCache` to be manually populated.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/unit/lib/personalityContext.test.ts`

Expected: PASS.

## Task 6: Listener And Archive Flow Integration Tests

**Files:**
- Modify: `src/listeners/messages/messageCreate.ts`
- Create: `tests/integration/listeners/personalityArchiveFlow.test.ts`

- [ ] **Step 1: Write failing listener integration tests**

Create tests that construct a minimal `Message`-like object and assert:

- a non-bot message in `GUESS_WHO_CHANNEL_ID` is archived,
- meaningful archived messages can later be queried as personality training messages,
- command-like archived messages remain archived but are not training eligible,
- disabled `personalityEnabled` prevents profile trigger state but does not break archiving if Guess Who/general archive is still active.

- [ ] **Step 2: Run listener tests to verify RED or current gaps**

Run: `pnpm vitest run tests/integration/listeners/personalityArchiveFlow.test.ts`

Expected: FAIL until listener boundaries and query behavior are aligned.

- [ ] **Step 3: Align listener flow**

Ensure message creation archives the general/Guess Who channel once, and personality trigger state is derived from archive-backed eligibility. Avoid writing duplicate disposable raw message source unless retained only as derived state.

- [ ] **Step 4: Run listener tests to verify GREEN**

Run: `pnpm vitest run tests/integration/listeners/personalityArchiveFlow.test.ts`

Expected: PASS.

## Task 7: Command Surface For User And Guild Profiles

**Files:**
- Modify: `src/commands/utility/personality.ts`
- Modify: `tests/unit/commands/structure.test.ts`
- Create: `tests/integration/commands/personality-command.test.ts`
- Modify: `web/src/data/commands.ts`
- Modify: `web/src/content/commands/personality.mdx`

- [ ] **Step 1: Write command tests**

Create tests for registered subcommands and user-visible behavior:

- `/personality user [user]` views user profile.
- `/personality guild` views guild profile.
- `/personality refresh-user [user]` is admin-only and describes incremental refresh.
- `/personality refresh-guild` is admin-only and describes incremental refresh.
- Below-threshold profile creation returns an evidence-threshold message, not “building now.”

- [ ] **Step 2: Run command tests to verify RED**

Run: `pnpm vitest run tests/integration/commands/personality-command.test.ts tests/unit/commands/structure.test.ts`

Expected: FAIL because current command uses `view`/`refresh` and no guild surface.

- [ ] **Step 3: Implement command changes**

Update `src/commands/utility/personality.ts` to register explicit user/guild subcommands. Keep replies ephemeral. Do not call a full rebuild from refresh commands.

- [ ] **Step 4: Update web docs/catalog in same change**

Update `web/src/data/commands.ts` and `web/src/content/commands/personality.mdx` so examples match actual subcommands and stop describing the feature as `OPT-IN`.

- [ ] **Step 5: Run command and web builds**

Run: `pnpm vitest run tests/integration/commands/personality-command.test.ts tests/unit/commands/structure.test.ts && pnpm web:build`

Expected: PASS.

## Task 8: Real-Ollama E2E Personality Test

**Files:**
- Create: `tests/e2e/personality/ollama-profile-generation.test.ts`
- Modify: `vitest.config.ts` only if needed to include/exclude e2e paths deliberately.
- Modify: `package.json` if adding a dedicated script such as `test:e2e:ollama`.

- [ ] **Step 1: Write opt-in real-Ollama e2e test**

Create a test that skips unless `RUN_OLLAMA_E2E=1`. It should:

- Insert a controlled archive corpus with at least the user threshold.
- Call the real `buildPersonalityProfile()` without mocking `callOllamaLowPriority`.
- Assert profile text is non-empty.
- Assert profile text does not contain direct source message strings.
- Assert cursor/profile metadata was updated.

Use a generous timeout, e.g. `180_000` ms.

- [ ] **Step 2: Run skip path**

Run: `pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts`

Expected: PASS with skipped tests when `RUN_OLLAMA_E2E` is unset.

- [ ] **Step 3: Run real path when model/profile code changes**

Run: `RUN_OLLAMA_E2E=1 pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts`

Expected: PASS if local Ollama/model is available; if unavailable, test should skip with an explicit availability check rather than fail from connection errors.

## Task 9: Full Verification And Review

**Files:**
- No new files unless verification reveals a specific issue.

- [ ] **Step 1: Run focused integration tests**

Run: `pnpm vitest run tests/integration/db/personality-training-queries.test.ts tests/integration/db/personality-profile-cursors.test.ts tests/integration/personality/profile-builders.test.ts`

Expected: PASS.

- [ ] **Step 2: Run command/listener tests**

Run: `pnpm vitest run tests/integration/listeners/personalityArchiveFlow.test.ts tests/integration/commands/personality-command.test.ts tests/unit/lib/personalityContext.test.ts tests/unit/commands/structure.test.ts`

Expected: PASS.

- [ ] **Step 3: Run opt-in e2e skip check**

Run: `pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts`

Expected: PASS with skip when `RUN_OLLAMA_E2E` is unset.

- [ ] **Step 4: Run real Ollama e2e when required**

If model prompts, Ollama integration, or profile-generation behavior changed, run: `RUN_OLLAMA_E2E=1 pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts`

Expected: PASS or explicit skip if local Ollama/model is unavailable.

- [ ] **Step 5: Run full verification**

Run: `pnpm test && pnpm build && pnpm web:build && docker compose config --quiet`

Expected: PASS. Compose may print warnings for unset deployment secrets but should exit successfully.

- [ ] **Step 6: Request final code review**

Use the requesting-code-review skill. Reviewer should focus on archive cursor correctness, profile thresholds, real/fake Ollama boundaries, command docs sync, and regressions in Guess Who archive behavior.

## Self-Review

- Spec coverage: archive source-of-truth is covered by Tasks 1, 3, 4, and 6; separate training eligibility by Task 1; user/guild boundary by Tasks 3, 4, 5, and 7; same channel/archive source by Tasks 1 and 6; backfilled/edited/deleted semantics by Task 1; incremental chunking by Tasks 2-4; command surface by Task 7; robust tests and real-Ollama e2e by Tasks 8-9.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: `lastTrainingMessageAt`, `getEligibleUserTrainingMessages`, `getEligibleGuildTrainingMessages`, `TrainingMessage`, and command names are used consistently across tasks.
