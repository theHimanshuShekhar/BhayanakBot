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
});
