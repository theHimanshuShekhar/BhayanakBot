# Public Bot Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fake web stats with DB-backed public bot stats and a durable bot-wide commands-run counter.

**Architecture:** Add two Drizzle tables: one singleton command counter and one singleton latest stats snapshot. Bot code increments the counter after successful commands and writes snapshots on startup plus a fixed interval. Astro reads the latest snapshot during render and falls back to unavailable values when no snapshot exists.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres, Sapphire Framework, Astro, Vitest.

---

## File Structure

- Modify: `src/db/schema.ts` — add `botCommandCounters` and `publicBotStatsSnapshots` tables.
- Create: `src/db/queries/publicStats.ts` — focused DB API for counter increment, counter read, snapshot write, and snapshot read.
- Create: `tests/integration/db/public-stats-queries.test.ts` — integration tests against real Drizzle query code.
- Create: `src/lib/publicStats.ts` — bot-facing helper that writes snapshots from a Discord client-like object.
- Create: `tests/unit/lib/publicStats.test.ts` — unit tests for snapshot payload construction and safe error behavior.
- Create: `src/listeners/commands/commandSuccess.ts` — Sapphire listener that increments command count after successful command execution.
- Modify: `src/index.ts` — write initial snapshot on `clientReady` and schedule interval refreshes.
- Modify: `web/src/data/stats.ts` — expose async stats loader that reads latest DB snapshot plus command catalog totals.
- Modify: `web/src/pages/index.astro` — await stats loader and relabel `commands run`.
- Modify: `web/src/pages/status.astro` — await stats loader and avoid fake uptime.
- Create: `web/src/data/publicStatsDb.ts` — web-side latest snapshot query using the existing root DB code.
- Modify: generated Drizzle migration files under `drizzle/` and `drizzle/meta/` via `pnpm db:generate`.

Do not commit during execution unless the user explicitly asks for commits.

## Task 1: Query Tests And Schema

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/queries/publicStats.ts`
- Create: `tests/integration/db/public-stats-queries.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/db/public-stats-queries.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getCommandCounter,
	getLatestPublicBotStatsSnapshot,
	incrementCommandsRun,
	writePublicBotStatsSnapshot,
} from "../../../src/db/queries/publicStats.js";
import { botCommandCounters, publicBotStatsSnapshots } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const COUNTER_NAME = "global";
const SNAPSHOT_NAME = "latest";

async function cleanupPublicStats(): Promise<void> {
	await db.delete(publicBotStatsSnapshots).where(eq(publicBotStatsSnapshots.name, SNAPSHOT_NAME));
	await db.delete(botCommandCounters).where(eq(botCommandCounters.name, COUNTER_NAME));
}

describe("public stats database queries", () => {
	beforeEach(async () => {
		await cleanupPublicStats();
	});

	it("creates and increments the global commands-run counter", async () => {
		await expect(getCommandCounter()).resolves.toBe(0);

		await expect(incrementCommandsRun()).resolves.toBe(1);
		await expect(incrementCommandsRun()).resolves.toBe(2);
		await expect(getCommandCounter()).resolves.toBe(2);
	});

	it("writes and retrieves the latest public stats snapshot", async () => {
		const capturedAt = new Date("2026-05-27T12:00:00.000Z");

		await writePublicBotStatsSnapshot({
			guilds: 3,
			commandsRun: 42,
			latencyMs: 88,
			capturedAt,
		});

		const snapshot = await getLatestPublicBotStatsSnapshot();
		expect(snapshot).toMatchObject({
			name: SNAPSHOT_NAME,
			guilds: 3,
			commandsRun: 42,
			latencyMs: 88,
		});
		expect(snapshot?.capturedAt.toISOString()).toBe(capturedAt.toISOString());
	});

	it("returns the stale latest snapshot until a newer snapshot is written", async () => {
		const firstCapturedAt = new Date("2026-05-27T12:00:00.000Z");
		await writePublicBotStatsSnapshot({ guilds: 1, commandsRun: 10, latencyMs: 50, capturedAt: firstCapturedAt });

		await expect(getLatestPublicBotStatsSnapshot()).resolves.toMatchObject({ commandsRun: 10 });

		const secondCapturedAt = new Date("2026-05-27T13:00:00.000Z");
		await writePublicBotStatsSnapshot({ guilds: 2, commandsRun: 11, latencyMs: 45, capturedAt: secondCapturedAt });

		const snapshot = await getLatestPublicBotStatsSnapshot();
		expect(snapshot).toMatchObject({ guilds: 2, commandsRun: 11, latencyMs: 45 });
		expect(snapshot?.capturedAt.toISOString()).toBe(secondCapturedAt.toISOString());
	});
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run tests/integration/db/public-stats-queries.test.ts`

Expected: FAIL because `src/db/queries/publicStats.js`, `botCommandCounters`, and `publicBotStatsSnapshots` do not exist yet.

- [ ] **Step 3: Add schema tables**

In `src/db/schema.ts`, add these tables near the other top-level bot tables, before personality/RPG module sections:

```ts
export const botCommandCounters = pgTable("bot_command_counters", {
	name: varchar("name", { length: 50 }).primaryKey(),
	commandsRun: integer("commands_run").default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const publicBotStatsSnapshots = pgTable("public_bot_stats_snapshots", {
	name: varchar("name", { length: 50 }).primaryKey(),
	guilds: integer("guilds").default(0).notNull(),
	commandsRun: integer("commands_run").default(0).notNull(),
	latencyMs: integer("latency_ms"),
	capturedAt: timestamp("captured_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 4: Add minimal query implementation**

Create `src/db/queries/publicStats.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { botCommandCounters, publicBotStatsSnapshots } from "../schema.js";

const GLOBAL_COUNTER_NAME = "global";
const LATEST_SNAPSHOT_NAME = "latest";

export type PublicBotStatsSnapshot = typeof publicBotStatsSnapshots.$inferSelect;

export interface PublicBotStatsSnapshotInput {
	guilds: number;
	commandsRun: number;
	latencyMs: number | null;
	capturedAt?: Date;
}

export async function incrementCommandsRun(): Promise<number> {
	const now = new Date();
	const [row] = await db
		.insert(botCommandCounters)
		.values({ name: GLOBAL_COUNTER_NAME, commandsRun: 1, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: botCommandCounters.name,
			set: {
				commandsRun: sql`${botCommandCounters.commandsRun} + 1`,
				updatedAt: now,
			},
		})
		.returning({ commandsRun: botCommandCounters.commandsRun });

	return row.commandsRun;
}

export async function getCommandCounter(): Promise<number> {
	const row = await db.query.botCommandCounters.findFirst({ where: eq(botCommandCounters.name, GLOBAL_COUNTER_NAME) });
	return row?.commandsRun ?? 0;
}

export async function writePublicBotStatsSnapshot(
	input: PublicBotStatsSnapshotInput,
): Promise<PublicBotStatsSnapshot> {
	const now = new Date();
	const capturedAt = input.capturedAt ?? now;
	const [row] = await db
		.insert(publicBotStatsSnapshots)
		.values({
			name: LATEST_SNAPSHOT_NAME,
			guilds: input.guilds,
			commandsRun: input.commandsRun,
			latencyMs: input.latencyMs,
			capturedAt,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: publicBotStatsSnapshots.name,
			set: {
				guilds: input.guilds,
				commandsRun: input.commandsRun,
				latencyMs: input.latencyMs,
				capturedAt,
				updatedAt: now,
			},
		})
		.returning();

	return row;
}

export async function getLatestPublicBotStatsSnapshot(): Promise<PublicBotStatsSnapshot | null> {
	const row = await db.query.publicBotStatsSnapshots.findFirst({
		where: eq(publicBotStatsSnapshots.name, LATEST_SNAPSHOT_NAME),
	});
	return row ?? null;
}
```

- [ ] **Step 5: Run tests to verify GREEN**

Run: `pnpm vitest run tests/integration/db/public-stats-queries.test.ts`

Expected: PASS after the test database has the new tables. If it fails with missing relations, run Task 2 to generate/apply the migration, then rerun this test.

## Task 2: Migration

**Files:**
- Modify: `drizzle/00xx_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `drizzle/meta/00xx_snapshot.json`

- [ ] **Step 1: Generate migration from schema changes**

Run: `pnpm db:generate`

Expected: a new SQL migration under `drizzle/` that creates `bot_command_counters` and `public_bot_stats_snapshots`, plus matching metadata updates.

- [ ] **Step 2: Inspect generated migration**

Confirm the SQL contains equivalent DDL:

```sql
CREATE TABLE "bot_command_counters" (
	"name" varchar(50) PRIMARY KEY NOT NULL,
	"commands_run" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_bot_stats_snapshots" (
	"name" varchar(50) PRIMARY KEY NOT NULL,
	"guilds" integer DEFAULT 0 NOT NULL,
	"commands_run" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
```

- [ ] **Step 3: Run migration-backed test**

Run: `pnpm vitest run tests/integration/db/public-stats-queries.test.ts`

Expected: PASS. Vitest global setup runs `pnpm db:migrate` against the test database.

## Task 3: Bot Snapshot Helper

**Files:**
- Create: `src/lib/publicStats.ts`
- Create: `tests/unit/lib/publicStats.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/lib/publicStats.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildPublicBotStatsSnapshotInput, getPublicStatsIntervalMs } from "../../../src/lib/publicStats.js";

describe("public stats helpers", () => {
	it("builds a snapshot input from the ready client and command counter", () => {
		const client = {
			guilds: { cache: { size: 7 } },
			ws: { ping: 123 },
		};

		const input = buildPublicBotStatsSnapshotInput(client, 99, new Date("2026-05-27T12:00:00.000Z"));

		expect(input).toEqual({
			guilds: 7,
			commandsRun: 99,
			latencyMs: 123,
			capturedAt: new Date("2026-05-27T12:00:00.000Z"),
		});
	});

	it("uses null latency when websocket ping is unavailable", () => {
		const client = { guilds: { cache: { size: 1 } }, ws: { ping: -1 } };

		expect(buildPublicBotStatsSnapshotInput(client, 5).latencyMs).toBeNull();
	});

	it("uses the default interval when PUBLIC_STATS_INTERVAL_MS is invalid", () => {
		const env = { PUBLIC_STATS_INTERVAL_MS: "nope" };

		expect(getPublicStatsIntervalMs(env)).toBe(5 * 60 * 1000);
	});

	it("uses PUBLIC_STATS_INTERVAL_MS when it is positive", () => {
		const env = { PUBLIC_STATS_INTERVAL_MS: "60000" };

		expect(getPublicStatsIntervalMs(env)).toBe(60_000);
	});
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run tests/unit/lib/publicStats.test.ts`

Expected: FAIL because `src/lib/publicStats.js` does not exist yet.

- [ ] **Step 3: Add minimal helper implementation**

Create `src/lib/publicStats.ts`:

```ts
import type { Client } from "discord.js";
import {
	getCommandCounter,
	type PublicBotStatsSnapshotInput,
	writePublicBotStatsSnapshot,
} from "../db/queries/publicStats.js";

export const DEFAULT_PUBLIC_STATS_INTERVAL_MS = 5 * 60 * 1000;

type SnapshotClient = Pick<Client, "guilds" | "ws">;

export function getPublicStatsIntervalMs(env: Pick<NodeJS.ProcessEnv, "PUBLIC_STATS_INTERVAL_MS">): number {
	const value = Number(env.PUBLIC_STATS_INTERVAL_MS);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_PUBLIC_STATS_INTERVAL_MS;
}

export function buildPublicBotStatsSnapshotInput(
	client: SnapshotClient,
	commandsRun: number,
	capturedAt = new Date(),
): PublicBotStatsSnapshotInput {
	const ping = client.ws.ping;
	return {
		guilds: client.guilds.cache.size,
		commandsRun,
		latencyMs: Number.isFinite(ping) && ping >= 0 ? ping : null,
		capturedAt,
	};
}

export async function writePublicBotStatsSnapshotForClient(client: SnapshotClient): Promise<void> {
	const commandsRun = await getCommandCounter();
	await writePublicBotStatsSnapshot(buildPublicBotStatsSnapshotInput(client, commandsRun));
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm vitest run tests/unit/lib/publicStats.test.ts`

Expected: PASS.

## Task 4: Successful Command Counter Listener

**Files:**
- Create: `src/listeners/commands/commandSuccess.ts`

- [ ] **Step 1: Add listener implementation**

Create `src/listeners/commands/commandSuccess.ts`:

```ts
import { Events, Listener } from "@sapphire/framework";
import { incrementCommandsRun } from "../../db/queries/publicStats.js";

export class CommandSuccessListener extends Listener<typeof Events.CommandSuccess> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.CommandSuccess });
	}

	public async run(): Promise<void> {
		try {
			await incrementCommandsRun();
		} catch (error) {
			this.container.logger.error("[public-stats] Failed to increment command counter:", error);
		}
	}
}
```

- [ ] **Step 2: Type-check listener event name**

Run: `pnpm build`

Expected: PASS. If `Events.CommandSuccess` is not the correct Sapphire event for the installed version, inspect `node_modules/@sapphire/framework` types and use the installed successful-command event constant while keeping the same listener behavior.

## Task 5: Bot Snapshot Scheduling

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Import snapshot helpers**

In `src/index.ts`, add:

```ts
import { getPublicStatsIntervalMs, writePublicBotStatsSnapshotForClient } from "./lib/publicStats.js";
```

- [ ] **Step 2: Add a local safe writer inside `main` before `client.once("clientReady", ...)`**

Add this inside `main`, after `registerPlayerEvents(client.player);` and before `client.once("clientReady", ...)`:

```ts
const writePublicStats = async () => {
	try {
		await writePublicBotStatsSnapshotForClient(client);
		client.logger.info("[public-stats] Snapshot written");
	} catch (err) {
		client.logger.error("[public-stats] Snapshot failed:", err);
	}
};
```

- [ ] **Step 3: Write initial snapshot and schedule interval after ready**

Inside the existing `client.once("clientReady", () => { ... })` callback, after the guild logging loop and before `backfillGuessWhoMessages`, add:

```ts
void writePublicStats();
setInterval(() => void writePublicStats(), getPublicStatsIntervalMs(process.env));
```

- [ ] **Step 4: Type-check startup changes**

Run: `pnpm build`

Expected: PASS.

## Task 6: Web Stats Loader

**Files:**
- Create: `web/src/data/publicStatsDb.ts`
- Modify: `web/src/data/stats.ts`

- [ ] **Step 1: Create web DB adapter**

Create `web/src/data/publicStatsDb.ts`:

```ts
import { getLatestPublicBotStatsSnapshot } from "../../../src/db/queries/publicStats.js";

export async function readLatestPublicBotStatsSnapshot() {
	try {
		return await getLatestPublicBotStatsSnapshot();
	} catch {
		return null;
	}
}
```

- [ ] **Step 2: Replace static stats with async loader**

Replace `web/src/data/stats.ts` with:

```ts
import { TOTAL_CATEGORIES, TOTAL_COMMANDS } from "./commands";
import { readLatestPublicBotStatsSnapshot } from "./publicStatsDb";

export interface PublicWebStats {
	servers: number | null;
	latencyMs: number | null;
	commands: number;
	categories: number;
	commandsRun: number | null;
	capturedAt: Date | null;
}

export async function getStats(): Promise<PublicWebStats> {
	const snapshot = await readLatestPublicBotStatsSnapshot();

	return {
		servers: snapshot?.guilds ?? null,
		latencyMs: snapshot?.latencyMs ?? null,
		commands: TOTAL_COMMANDS,
		categories: TOTAL_CATEGORIES,
		commandsRun: snapshot?.commandsRun ?? null,
		capturedAt: snapshot?.capturedAt ?? null,
	};
}

export function formatStatNumber(value: number | null): string {
	return value === null ? "unavailable" : value.toLocaleString();
}

export function formatLatency(value: number | null): string {
	return value === null ? "unavailable" : `${value}ms`;
}
```

- [ ] **Step 3: Build to catch alias/import issues**

Run: `pnpm web:build`

Expected: FAIL until pages are updated from `stats` to `getStats`.

## Task 7: Update Astro Pages

**Files:**
- Modify: `web/src/pages/index.astro`
- Modify: `web/src/pages/status.astro`

- [ ] **Step 1: Update landing page imports and stats initialization**

In `web/src/pages/index.astro`, replace:

```ts
import { stats } from "~/data/stats";
```

with:

```ts
import { formatLatency, formatStatNumber, getStats } from "~/data/stats";
```

Then add after imports/frontmatter constants:

```ts
const stats = await getStats();
```

- [ ] **Step 2: Update landing page rendered stats**

Replace `stats.servers.toLocaleString()` with `formatStatNumber(stats.servers)`.

Replace `{stats.latencyMs}ms latency` with `{formatLatency(stats.latencyMs)} latency`.

Replace the `StatStrip` stats array with:

```astro
<StatStrip stats={[
	{ value: formatStatNumber(stats.servers), label: "active servers" },
	{ value: String(stats.commands), label: `${stats.categories} categories` },
	{ value: formatStatNumber(stats.commandsRun), label: "commands run", accent: true },
	{ value: formatLatency(stats.latencyMs), label: "median latency" },
]} />
```

- [ ] **Step 3: Update status page imports and stats initialization**

In `web/src/pages/status.astro`, replace:

```ts
import { stats } from "~/data/stats";
```

with:

```ts
import { formatLatency, getStats } from "~/data/stats";
```

Then add:

```ts
const stats = await getStats();
```

- [ ] **Step 4: Replace fake uptime strip**

Replace the status page `StatStrip` array with:

```astro
<StatStrip stats={[
	{ value: stats.capturedAt ? "snapshot fresh" : "unavailable", label: "public stats", accent: true },
	{ value: "0", label: "open incidents" },
	{ value: formatLatency(stats.latencyMs), label: "median latency" },
	{ value: "1/1", label: "bot process" },
]} />
```

- [ ] **Step 5: Build to verify web changes**

Run: `pnpm web:build`

Expected: PASS. If build fails because Astro static output cannot import root server DB code, switch the web app to server output or move stats rendering behind an API-compatible server path; do not reintroduce fake stats.

## Task 8: Full Verification

**Files:**
- No new files unless verification reveals a real issue.

- [ ] **Step 1: Run focused tests**

Run: `pnpm vitest run tests/integration/db/public-stats-queries.test.ts tests/unit/lib/publicStats.test.ts`

Expected: PASS.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: PASS with no unhandled errors.

- [ ] **Step 3: Run TypeScript build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Run web build**

Run: `pnpm web:build`

Expected: PASS.

- [ ] **Step 5: Validate Docker Compose config**

Run: `docker compose config --quiet`

Expected: exits successfully with no output.

- [ ] **Step 6: Review diff**

Run: `git diff -- src/db/schema.ts src/db/queries/publicStats.ts src/lib/publicStats.ts src/listeners/commands/commandSuccess.ts src/index.ts web/src/data/stats.ts web/src/data/publicStatsDb.ts web/src/pages/index.astro web/src/pages/status.astro tests/integration/db/public-stats-queries.test.ts tests/unit/lib/publicStats.test.ts docs/superpowers/specs/2026-05-27-public-bot-stats-design.md docs/superpowers/plans/2026-05-27-public-bot-stats.md drizzle`

Expected: diff only contains public stats changes and generated migration files.

## Self-Review

- Spec coverage: durable commands-run counter is covered by Tasks 1 and 4; snapshot writes are covered by Tasks 1, 3, and 5; web latest snapshot reads are covered by Tasks 6 and 7; no-fake fallback is covered by Task 6; fixed interval config is covered by Tasks 3 and 5.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: table names, function names, and exported helper names are consistent across tasks.
