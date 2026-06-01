import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { levelRewards, users } from "../schema.js";

export type User = typeof users.$inferSelect;

export async function getOrCreateUser(userId: string, guildId: string): Promise<User> {
	const [created] = await db.insert(users).values({ userId, guildId }).onConflictDoNothing().returning();
	if (created) return created;

	const existing = await db.query.users.findFirst({
		where: and(eq(users.userId, userId), eq(users.guildId, guildId)),
	});
	if (!existing) throw new Error(`Failed to create or load user ${userId} in guild ${guildId}`);
	return existing;
}

export async function addXp(
	userId: string,
	guildId: string,
	amount: number,
): Promise<{ user: User; leveledUp: boolean; newLevel: number }> {
	const user = await getOrCreateUser(userId, guildId);

	if (amount === 0) {
		return { user, leveledUp: false, newLevel: user.level };
	}

	const [updated] = await db
		.update(users)
		.set({
			xp: sql`${users.xp} + ${amount}`,
			level: sql`FLOOR(0.1 * SQRT(${users.xp} + ${amount}))::int`,
			totalMessages: sql`${users.totalMessages} + 1`,
			lastMessageAt: new Date(),
		})
		.where(and(eq(users.userId, userId), eq(users.guildId, guildId)))
		.returning();
	if (!updated) throw new Error(`Failed to update XP for user ${userId} in guild ${guildId}`);

	const previousLevel = Math.floor(0.1 * Math.sqrt(updated.xp - amount));
	return { user: updated, leveledUp: updated.level > previousLevel, newLevel: updated.level };
}

export async function getLeaderboard(guildId: string, limit = 10, offset = 0): Promise<User[]> {
	return db.query.users.findMany({
		where: eq(users.guildId, guildId),
		orderBy: [desc(users.xp)],
		limit,
		offset,
	});
}

export async function resetUser(userId: string, guildId: string): Promise<void> {
	await db
		.update(users)
		.set({ xp: 0, level: 0, totalMessages: 0, lastMessageAt: null })
		.where(and(eq(users.userId, userId), eq(users.guildId, guildId)));
}

export async function getLevelRewards(guildId: string) {
	return db.query.levelRewards.findMany({ where: eq(levelRewards.guildId, guildId) });
}

export async function addLevelReward(guildId: string, level: number, roleId: string) {
	await db.insert(levelRewards).values({ guildId, level, roleId }).onConflictDoNothing();
}

export async function removeLevelReward(guildId: string, level: number) {
	await db.delete(levelRewards).where(and(eq(levelRewards.guildId, guildId), eq(levelRewards.level, level)));
}
