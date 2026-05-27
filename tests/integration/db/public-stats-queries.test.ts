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
