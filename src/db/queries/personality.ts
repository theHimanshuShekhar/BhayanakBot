import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
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

export async function getPersonalityProfile(userId: string, guildId: string): Promise<string | null> {
	const row = await db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, guildId)),
		columns: { profile: true },
	});
	return row?.profile ?? null;
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
	if (!row) {
		throw new Error(`incrementMessageCount: empty returning for ${userId}/${guildId}`);
	}
	return row.newMessageCount;
}

/** Returns up to 50 users who have unabsorbed messages AND (count >= 100 OR never refreshed OR last refresh > 6h ago).
 *  Sorted by highest message count first, then oldest refresh date (nulls first). */
export async function getUsersNeedingRefresh(): Promise<{ userId: string; guildId: string }[]> {
	const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
	return db.query.userPersonalityProfiles.findMany({
		where: and(
			sql`${userPersonalityProfiles.newMessageCount} > 0`,
			or(
				sql`${userPersonalityProfiles.newMessageCount} >= 100`,
				isNull(userPersonalityProfiles.lastRefreshedAt),
				lt(userPersonalityProfiles.lastRefreshedAt, sixHoursAgo),
			),
		),
		orderBy: [desc(userPersonalityProfiles.newMessageCount), asc(userPersonalityProfiles.lastRefreshedAt)],
		limit: 50,
		columns: { userId: true, guildId: true },
	});
}
