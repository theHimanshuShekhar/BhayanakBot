import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { userMessages, userPersonalityProfiles } from "../schema.js";

export async function storeUserMessage(userId: string, guildId: string, content: string): Promise<void> {
	await db.insert(userMessages).values({ userId, guildId, content });
}

export async function getUnabsorbedMessages(userId: string, guildId: string): Promise<{ id: number; content: string }[]> {
	return db.query.userMessages.findMany({
		where: and(eq(userMessages.userId, userId), eq(userMessages.guildId, guildId)),
		columns: { id: true, content: true },
	});
}

export async function deleteAbsorbedMessages(ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	await db.delete(userMessages).where(inArray(userMessages.id, ids));
}

export async function getPersonalityProfile(userId: string, guildId: string): Promise<string | null> {
	const row = await db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, guildId)),
		columns: { profile: true },
	});
	return row?.profile ?? null;
}

export async function upsertPersonalityProfile(userId: string, guildId: string, profile: string): Promise<void> {
	await db
		.insert(userPersonalityProfiles)
		.values({ userId, guildId, profile, newMessageCount: 0, lastRefreshedAt: new Date() })
		.onConflictDoUpdate({
			target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
			set: { profile, newMessageCount: 0, lastRefreshedAt: new Date() },
		});
}

/** Increments newMessageCount and returns the updated count. Creates the profile row if it doesn't exist. */
export async function incrementMessageCount(userId: string, guildId: string): Promise<number> {
	const [row] = await db
		.insert(userPersonalityProfiles)
		.values({ userId, guildId, newMessageCount: 1 })
		.onConflictDoUpdate({
			target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
			set: { newMessageCount: sql`${userPersonalityProfiles.newMessageCount} + 1` },
		})
		.returning({ newMessageCount: userPersonalityProfiles.newMessageCount });
	return row.newMessageCount;
}

/** Returns users who have unabsorbed messages AND (count >= 100 OR last refresh > 6h ago OR never refreshed). */
export async function getUsersNeedingRefresh(): Promise<{ userId: string; guildId: string }[]> {
	const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
	return db.query.userPersonalityProfiles.findMany({
		where: and(
			sql`${userPersonalityProfiles.newMessageCount} > 0`,
			or(
				sql`${userPersonalityProfiles.newMessageCount} >= 100`,
				eq(userPersonalityProfiles.lastRefreshedAt, null as unknown as Date),
				lt(userPersonalityProfiles.lastRefreshedAt, sixHoursAgo),
			),
		),
		columns: { userId: true, guildId: true },
	});
}
