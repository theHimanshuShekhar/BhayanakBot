import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetValue } from "../../../src/commands/config/config.js";
import { getOrCreateSettings, updateSettings } from "../../../src/db/queries/guildSettings.js";
import { guildSettings } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "settings-guild-108";

async function cleanup(): Promise<void> {
	await db.delete(guildSettings).where(eq(guildSettings.guildId, GUILD_ID));
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
});
