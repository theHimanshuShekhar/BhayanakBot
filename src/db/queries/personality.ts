import { container } from "@sapphire/framework";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { userPersonalityProfiles } from "../schema.js";

export async function getPersonalityProfile(userId: string, guildId: string): Promise<string | null> {
	container.logger.debug(`[personality-db] get-profile start userId=${userId} guildId=${guildId}`);
	const row = await db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, guildId)),
		columns: { profile: true },
	});
	container.logger.debug(
		`[personality-db] get-profile result userId=${userId} guildId=${guildId} profile=${row?.profile ? `present length=${row.profile.length}` : "missing"}`,
	);
	return row?.profile ?? null;
}

/** Increments newMessageCount and returns the updated count. Creates the profile row if it doesn't exist. */
export async function incrementMessageCount(userId: string, guildId: string): Promise<number> {
	container.logger.debug(`[personality-db] increment-message-count start userId=${userId} guildId=${guildId}`);
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
	container.logger.debug(
		`[personality-db] increment-message-count result userId=${userId} guildId=${guildId} newMessageCount=${row.newMessageCount}`,
	);
	return row.newMessageCount;
}

/** Returns up to 50 users who have unabsorbed messages AND (count >= 100 OR never refreshed OR last refresh > 6h ago).
 *  Sorted by highest message count first, then oldest refresh date (nulls first). */
export async function getUsersNeedingRefresh(): Promise<{ userId: string; guildId: string }[]> {
	const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
	container.logger.debug(`[personality-db] get-users-needing-refresh start cutoff=${sixHoursAgo.toISOString()}`);
	const rows = await db.query.userPersonalityProfiles.findMany({
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
	container.logger.debug(`[personality-db] get-users-needing-refresh result count=${rows.length}`);
	return rows;
}
