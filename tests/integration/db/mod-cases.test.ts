import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createCase, getCase, getExpiredActiveCases } from "../../../src/db/queries/modCases.js";
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

	describe("supersession", () => {
		const base = { guildId: TEST_GUILD_ID, userId: "target", moderatorId: "mod-1" } as const;

		async function activeTypes(userId = "target"): Promise<string[]> {
			const rows = await db.query.modCases.findMany({
				where: and(eq(modCases.guildId, TEST_GUILD_ID), eq(modCases.userId, userId), eq(modCases.active, true)),
			});
			return rows.map((row) => row.type).sort();
		}

		it("a permanent ban supersedes an active tempban so its expiry no longer unbans", async () => {
			const past = new Date(Date.now() - 1000);
			await createCase({ ...base, type: "tempban", expiresAt: past });
			await createCase({ ...base, type: "ban" });

			expect(await activeTypes()).toEqual(["ban"]);
			await expect(getExpiredActiveCases("tempban")).resolves.toEqual([]);
		});

		it("a new tempban supersedes earlier ban-type cases", async () => {
			await createCase({ ...base, type: "ban" });
			await createCase({ ...base, type: "tempban", expiresAt: new Date(Date.now() + 60_000) });
			await createCase({ ...base, type: "tempban", expiresAt: new Date(Date.now() + 120_000) });

			expect(await activeTypes()).toEqual(["tempban"]);
		});

		it("an unban closes the member's active ban and tempban cases", async () => {
			await createCase({ ...base, type: "tempban", expiresAt: new Date(Date.now() + 60_000) });
			await createCase({ ...base, type: "unban" });

			expect(await activeTypes()).toEqual(["unban"]);
		});

		it("a second mute replaces the first so the earlier expiry cannot unmute early", async () => {
			const first = await createCase({ ...base, type: "mute", expiresAt: new Date(Date.now() - 1000) });
			const second = await createCase({ ...base, type: "mute", expiresAt: new Date(Date.now() + 60_000) });

			expect(await activeTypes()).toEqual(["mute"]);
			await expect(getExpiredActiveCases("mute")).resolves.toEqual([]);
			const rows = await db.query.modCases.findMany({ where: eq(modCases.id, first.id) });
			expect(rows[0].active).toBe(false);
			expect(second.active).toBe(true);
		});

		it("an unmute closes the member's active mute cases", async () => {
			await createCase({ ...base, type: "mute", expiresAt: new Date(Date.now() + 60_000) });
			await createCase({ ...base, type: "unmute" });

			expect(await activeTypes()).toEqual(["unmute"]);
		});

		it("does not cross over between ban-type and mute-type or between members and guilds", async () => {
			await createCase({ ...base, type: "tempban", expiresAt: new Date(Date.now() + 60_000) });
			await createCase({ ...base, type: "mute", expiresAt: new Date(Date.now() + 60_000) });
			await createCase({ ...base, userId: "other", type: "mute", expiresAt: new Date(Date.now() + 60_000) });
			await createCase({ ...base, type: "unmute" });
			await createCase({ ...base, type: "warn" });
			await createCase({ ...base, type: "kick" });

			expect(await activeTypes()).toEqual(["kick", "tempban", "unmute", "warn"]);
			expect(await activeTypes("other")).toEqual(["mute"]);

			const otherGuild = await createCase({ ...base, guildId: "mod-case-guild-2", type: "tempban" });
			await createCase({ ...base, type: "unban" });
			const [stillActive] = await db.query.modCases.findMany({ where: eq(modCases.id, otherGuild.id) });
			expect(stillActive.active).toBe(true);
			await db.delete(modCases).where(eq(modCases.guildId, "mod-case-guild-2"));
		});
	});
});
