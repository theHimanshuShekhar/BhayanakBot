import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { users, levelRewards } from "../schema.js";

export type User = typeof users.$inferSelect;

export async function getOrCreateUser(userId: string, guildId: string): Promise<User> {
	const existing = await db.query.users.findFirst({
		where: and(eq(users.userId, userId), eq(users.guildId, guildId)),
	});
	if (existing) return existing;
	const [created] = await db.insert(users).values({ userId, guildId }).returning();
	return created;
}

export async function addXp(userId: string, guildId: string, amount: number): Promise<{ user: User; leveledUp: boolean; newLevel: number }> {
	const user = await getOrCreateUser(userId, guildId);
	const newXp = user.xp + amount;
	const newLevel = Math.floor(0.1 * Math.sqrt(newXp));
	const leveledUp = newLevel > user.level;

	const [updated] = await db
		.update(users)
		.set({ xp: newXp, level: newLevel, totalMessages: user.totalMessages + 1, lastMessageAt: new Date() })
		.where(and(eq(users.userId, userId), eq(users.guildId, guildId)))
		.returning();

	return { user: updated, leveledUp, newLevel };
}

export async function getLeaderboard(guildId: string, limit = 10): Promise<User[]> {
	return db.query.users.findMany({
		where: eq(users.guildId, guildId),
		orderBy: [desc(users.xp)],
		limit,
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
