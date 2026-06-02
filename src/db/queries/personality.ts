import { container } from "@sapphire/framework";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { userMessages, userPersonalityProfiles } from "../schema.js";

const MESSAGE_RETENTION_DAYS = 30;

export async function storeUserMessage(userId: string, guildId: string, content: string): Promise<void> {
	container.logger.debug(
		`[personality-db] store-user-message start userId=${userId} guildId=${guildId} contentLength=${content.length}`,
	);
	await db.insert(userMessages).values({ userId, guildId, content });
	container.logger.debug(`[personality-db] store-user-message complete userId=${userId} guildId=${guildId}`);
}

export async function getUnabsorbedMessages(
	userId: string,
	guildId: string,
): Promise<{ id: number; content: string }[]> {
	container.logger.debug(`[personality-db] get-unabsorbed-messages start userId=${userId} guildId=${guildId}`);
	const rows = await db.query.userMessages.findMany({
		where: and(eq(userMessages.userId, userId), eq(userMessages.guildId, guildId)),
		columns: { id: true, content: true },
	});
	container.logger.debug(
		`[personality-db] get-unabsorbed-messages result userId=${userId} guildId=${guildId} count=${rows.length}`,
	);
	return rows;
}

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

/** Deletes messages older than MESSAGE_RETENTION_DAYS to prevent unbounded table growth. */
export async function cleanupOldMessages(): Promise<void> {
	const cutoff = new Date(Date.now() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
	container.logger.debug(`[personality-db] cleanup-old-messages start cutoff=${cutoff.toISOString()}`);
	const result = await db.delete(userMessages).where(lt(userMessages.createdAt, cutoff));
	container.logger.debug(`[personality-db] cleanup-old-messages complete deleted=${result.rowCount ?? "unknown"}`);
}
