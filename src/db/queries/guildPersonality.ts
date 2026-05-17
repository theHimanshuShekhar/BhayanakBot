import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { guildPersonalityProfiles, userMessages } from "../schema.js";

export async function getGuildPersonalityProfile(guildId: string): Promise<string | null> {
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { profile: true },
	});
	return row?.profile ?? null;
}

export async function incrementGuildMessageCount(guildId: string): Promise<number> {
	const [row] = await db
		.insert(guildPersonalityProfiles)
		.values({ guildId, messageCount: 1 })
		.onConflictDoUpdate({
			target: guildPersonalityProfiles.guildId,
			set: { messageCount: sql`${guildPersonalityProfiles.messageCount} + 1` },
		})
		.returning({ messageCount: guildPersonalityProfiles.messageCount });
	if (!row) throw new Error(`incrementGuildMessageCount: empty returning for ${guildId}`);
	return row.messageCount;
}

export async function getGuildMessageCount(guildId: string): Promise<number> {
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { messageCount: true },
	});
	return row?.messageCount ?? 0;
}

export async function updateGuildPersonalityProfile(guildId: string, profile: string): Promise<void> {
	await db
		.insert(guildPersonalityProfiles)
		.values({ guildId, profile, messageCount: 0, lastRefreshedAt: new Date() })
		.onConflictDoUpdate({
			target: guildPersonalityProfiles.guildId,
			set: { profile, messageCount: 0, lastRefreshedAt: new Date() },
		});
}

export async function getRecentGuildMessages(guildId: string, limit: number): Promise<{ content: string }[]> {
	return db.query.userMessages.findMany({
		where: eq(userMessages.guildId, guildId),
		columns: { content: true },
		orderBy: [sql`${userMessages.id} DESC`],
		limit,
	});
}

/** Resets the guild message count to a specific value (used for self-healing after failed builds). */
export async function resetGuildMessageCount(guildId: string, count: number): Promise<void> {
	await db
		.insert(guildPersonalityProfiles)
		.values({ guildId, messageCount: count })
		.onConflictDoUpdate({
			target: guildPersonalityProfiles.guildId,
			set: { messageCount: count },
		});
}
