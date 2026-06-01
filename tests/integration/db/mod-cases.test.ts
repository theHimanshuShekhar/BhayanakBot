import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createCase, getCase } from "../../../src/db/queries/modCases.js";
import { modCases } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const TEST_GUILD_ID = "mod-case-guild";

async function cleanupModCases(): Promise<void> {
	await db.delete(modCases).where(eq(modCases.guildId, TEST_GUILD_ID));
}

describe("moderation case queries", () => {
	beforeEach(async () => {
		await cleanupModCases();
	});

	it("allocates sequential per-guild case numbers", async () => {
		const first = await createCase({
			guildId: TEST_GUILD_ID,
			userId: "user-1",
			moderatorId: "mod-1",
			type: "warn",
			reason: "first",
		});
		const second = await createCase({
			guildId: TEST_GUILD_ID,
			userId: "user-2",
			moderatorId: "mod-1",
			type: "mute",
			reason: "second",
		});

		expect(first.caseNumber).toBe(1);
		expect(second.caseNumber).toBe(2);
		await expect(getCase(TEST_GUILD_ID, 2)).resolves.toMatchObject({ id: second.id });
	});

	it("allocates unique sequential case numbers under concurrent inserts", async () => {
		const created = await Promise.all(
			Array.from({ length: 12 }, (_, index) =>
				createCase({
					guildId: TEST_GUILD_ID,
					userId: `user-${index}`,
					moderatorId: "mod-1",
					type: "warn",
					reason: `concurrent-${index}`,
				}),
			),
		);

		const caseNumbers = created.map((modCase) => modCase.caseNumber).sort((a, b) => a - b);
		expect(caseNumbers).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));

		const rows = await db.query.modCases.findMany({
			where: and(eq(modCases.guildId, TEST_GUILD_ID), eq(modCases.moderatorId, "mod-1")),
		});
		expect(new Set(rows.map((modCase) => modCase.caseNumber)).size).toBe(12);
	});
});
