import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { guildPersonalityProfiles, userPersonalityProfiles } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "cursor-guild";
const USER_ID = "cursor-user";

describe("personality profile cursors", () => {
	beforeEach(async () => {
		await db
			.delete(userPersonalityProfiles)
			.where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
		await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	});

	it("stores the last user training message cursor", async () => {
		const lastTrainingMessageAt = new Date("2026-05-01T00:00:00Z");
		const [row] = await db
			.insert(userPersonalityProfiles)
			.values({
				userId: USER_ID,
				guildId: GUILD_ID,
				lastTrainingMessageAt,
				lastTrainingMessageId: "cursor-user-message",
			})
			.returning();

		expect(row.lastTrainingMessageAt?.toISOString()).toBe(lastTrainingMessageAt.toISOString());
		expect(row.lastTrainingMessageId).toBe("cursor-user-message");
	});

	it("stores the last guild training message cursor", async () => {
		const lastTrainingMessageAt = new Date("2026-05-01T00:00:00Z");
		const [row] = await db
			.insert(guildPersonalityProfiles)
			.values({
				guildId: GUILD_ID,
				lastTrainingMessageAt,
				lastTrainingMessageId: "cursor-guild-message",
			})
			.returning();

		expect(row.lastTrainingMessageAt?.toISOString()).toBe(lastTrainingMessageAt.toISOString());
		expect(row.lastTrainingMessageId).toBe("cursor-guild-message");
	});
});
