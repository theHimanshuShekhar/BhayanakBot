import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetValue } from "../../../src/commands/config/config.js";
import { getOrCreateSettings, updateSettings } from "../../../src/db/queries/guildSettings.js";
import { guildSettings } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";
import {
	getCachedGuildSettings,
	guildSettingsEpoch,
	invalidateGuildSettings,
	setCachedGuildSettings,
} from "../../../src/lib/music/guildSettingsCache.js";

const GUILD_ID = "settings-guild-108";

async function cleanup(): Promise<void> {
	await db.delete(guildSettings).where(eq(guildSettings.guildId, GUILD_ID));
	invalidateGuildSettings(GUILD_ID);
}

describe("guild settings queries", () => {
	beforeEach(cleanup);
	afterAll(cleanup);

	it("an empty update succeeds, creates the row, and changes nothing", async () => {
		const before = await updateSettings(GUILD_ID, {});
		expect(before.guildId).toBe(GUILD_ID);

		await updateSettings(GUILD_ID, { starThreshold: 9 });
		const after = await updateSettings(GUILD_ID, {});
		expect(after.starThreshold).toBe(9);
	});

	it("resetting settings clears channels and restores numeric defaults", async () => {
		await updateSettings(GUILD_ID, {
			logChannelId: "123",
			autoRole: "456",
			welcomeMessage: "hi",
			starThreshold: 9,
			xpRate: 99,
			xpCooldownSeconds: 5,
			randomResponseChance: 40,
			personalityEnabled: false,
		});

		for (const key of [
			"logChannelId",
			"autoRole",
			"welcomeMessage",
			"starThreshold",
			"xpRate",
			"xpCooldownSeconds",
			"randomResponseChance",
			"personalityEnabled",
		] as const) {
			await updateSettings(GUILD_ID, { [key]: resetValue(key) });
		}

		const settings = await getOrCreateSettings(GUILD_ID);
		expect(settings).toMatchObject({
			guildId: GUILD_ID,
			logChannelId: null,
			autoRole: null,
			welcomeMessage: null,
			starThreshold: 3,
			xpRate: 15,
			xpCooldownSeconds: 60,
			randomResponseChance: 0,
			personalityEnabled: true,
		});
	});

	it("concurrent first lookups for a new guild all succeed and share one row", async () => {
		const results = await Promise.all(Array.from({ length: 10 }, () => getOrCreateSettings(GUILD_ID)));

		expect(new Set(results.map((r) => r.guildId))).toEqual(new Set([GUILD_ID]));
		const rows = await db.select().from(guildSettings).where(eq(guildSettings.guildId, GUILD_ID));
		expect(rows).toHaveLength(1);
	});

	it("serves repeat lookups from the cache until an update invalidates it", async () => {
		await getOrCreateSettings(GUILD_ID);

		// A write that bypasses updateSettings is invisible while the entry is cached.
		await db.update(guildSettings).set({ starThreshold: 7 }).where(eq(guildSettings.guildId, GUILD_ID));
		expect((await getOrCreateSettings(GUILD_ID)).starThreshold).toBe(3);

		await updateSettings(GUILD_ID, { xpRate: 20 });
		const after = await getOrCreateSettings(GUILD_ID);
		expect(after.xpRate).toBe(20);
		expect(after.starThreshold).toBe(7);
	});

	it("a row read before an invalidation is not cached afterwards", async () => {
		const row = await getOrCreateSettings(GUILD_ID);
		invalidateGuildSettings(GUILD_ID);
		const readEpoch = guildSettingsEpoch();
		invalidateGuildSettings(GUILD_ID);

		setCachedGuildSettings(GUILD_ID, row, readEpoch);

		expect(getCachedGuildSettings(GUILD_ID)).toBeUndefined();
	});

	it("the pool applies the statement timeout and application name", async () => {
		const result = await db.execute<{ name: string; timeout: string }>(
			sql`select current_setting('application_name') as name, current_setting('statement_timeout') as timeout`,
		);
		expect(result.rows[0]).toEqual({ name: "bhayanakbot", timeout: "1min" });
	});
});
