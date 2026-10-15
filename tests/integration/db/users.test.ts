import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addXp, getOrCreateUser } from "../../../src/db/queries/users.js";
import { users } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const TEST_USER_ID = "level-user-123";
const TEST_GUILD_ID = "level-guild-123";

async function cleanupUser(): Promise<void> {
	await db.delete(users).where(and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)));
}

describe("user leveling queries", () => {
	beforeEach(async () => {
		await cleanupUser();
	});

	it("creates a user once under concurrent getOrCreateUser calls", async () => {
		const created = await Promise.all(Array.from({ length: 8 }, () => getOrCreateUser(TEST_USER_ID, TEST_GUILD_ID)));

		expect(new Set(created.map((user) => `${user.userId}:${user.guildId}`)).size).toBe(1);
		const rows = await db.query.users.findMany({
			where: and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)),
		});
		expect(rows).toHaveLength(1);
	});

	it("increments XP atomically under concurrent addXp calls", async () => {
		await getOrCreateUser(TEST_USER_ID, TEST_GUILD_ID);

		await Promise.all(Array.from({ length: 10 }, () => addXp(TEST_USER_ID, TEST_GUILD_ID, 15)));

		const user = await db.query.users.findFirst({
			where: and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)),
		});
		expect(user?.xp).toBe(150);
		expect(user?.totalMessages).toBe(10);
		expect(user?.level).toBe(Math.floor(0.1 * Math.sqrt(150)));
	});

	it("does not count a zero-XP call as a message", async () => {
		await addXp(TEST_USER_ID, TEST_GUILD_ID, 0);

		const user = await db.query.users.findFirst({
			where: and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)),
		});
		expect(user?.xp).toBe(0);
		expect(user?.totalMessages).toBe(0);
	});

	describe("XP cooldown", () => {
		const COOLDOWN_MS = 60_000;

		async function loadUser() {
			return db.query.users.findFirst({
				where: and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)),
			});
		}

		it("awards XP once for concurrent messages inside the cooldown", async () => {
			const results = await Promise.all(
				Array.from({ length: 10 }, () => addXp(TEST_USER_ID, TEST_GUILD_ID, 15, COOLDOWN_MS)),
			);

			expect(results.filter((result) => result.awarded)).toHaveLength(1);
			const user = await loadUser();
			expect(user?.xp).toBe(15);
			expect(user?.totalMessages).toBe(1);
		});

		it("awards XP once for a second message right after the first", async () => {
			const first = await addXp(TEST_USER_ID, TEST_GUILD_ID, 15, COOLDOWN_MS);
			const second = await addXp(TEST_USER_ID, TEST_GUILD_ID, 15, COOLDOWN_MS);

			expect(first.awarded).toBe(true);
			expect(second).toMatchObject({ awarded: false, leveledUp: false });
			expect((await loadUser())?.xp).toBe(15);
		});

		it("awards again once the cooldown has passed", async () => {
			await addXp(TEST_USER_ID, TEST_GUILD_ID, 15, COOLDOWN_MS);
			await db
				.update(users)
				.set({ lastMessageAt: new Date(Date.now() - COOLDOWN_MS - 1000) })
				.where(and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)));

			const again = await addXp(TEST_USER_ID, TEST_GUILD_ID, 15, COOLDOWN_MS);

			expect(again.awarded).toBe(true);
			expect((await loadUser())?.xp).toBe(30);
		});

		it("decides the level-up from the awarded row", async () => {
			await getOrCreateUser(TEST_USER_ID, TEST_GUILD_ID);
			await db
				.update(users)
				.set({ xp: 99, level: 0 })
				.where(and(eq(users.userId, TEST_USER_ID), eq(users.guildId, TEST_GUILD_ID)));

			const result = await addXp(TEST_USER_ID, TEST_GUILD_ID, 1, COOLDOWN_MS);

			expect(result).toMatchObject({ awarded: true, leveledUp: true, newLevel: 1 });
		});

		it("applies no cooldown when none is given", async () => {
			await addXp(TEST_USER_ID, TEST_GUILD_ID, 15);
			const second = await addXp(TEST_USER_ID, TEST_GUILD_ID, 15);

			expect(second.awarded).toBe(true);
			expect((await loadUser())?.xp).toBe(30);
		});
	});
});
