import { container } from "@sapphire/framework";
import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { guildPersonalityProfiles, userMessages } from "../schema.js";

export async function getGuildPersonalityProfile(guildId: string): Promise<string | null> {
	container.logger.debug(`[guild-personality-db] get-profile start guildId=${guildId}`);
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { profile: true },
	});
	container.logger.debug(
		`[guild-personality-db] get-profile result guildId=${guildId} profile=${row?.profile ? `present length=${row.profile.length}` : "missing"}`,
	);
	return row?.profile ?? null;
}

export async function incrementGuildMessageCount(guildId: string): Promise<number> {
	container.logger.debug(`[guild-personality-db] increment-message-count start guildId=${guildId}`);
	const [row] = await db
		.insert(guildPersonalityProfiles)
		.values({ guildId, messageCount: 1 })
		.onConflictDoUpdate({
			target: guildPersonalityProfiles.guildId,
			set: { messageCount: sql`${guildPersonalityProfiles.messageCount} + 1` },
		})
		.returning({ messageCount: guildPersonalityProfiles.messageCount });
	if (!row) throw new Error(`incrementGuildMessageCount: empty returning for ${guildId}`);
	container.logger.debug(
		`[guild-personality-db] increment-message-count result guildId=${guildId} messageCount=${row.messageCount}`,
	);
	return row.messageCount;
}

export async function getGuildMessageCount(guildId: string): Promise<number> {
	container.logger.debug(`[guild-personality-db] get-message-count start guildId=${guildId}`);
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { messageCount: true },
	});
	container.logger.debug(
		`[guild-personality-db] get-message-count result guildId=${guildId} messageCount=${row?.messageCount ?? 0}`,
	);
	return row?.messageCount ?? 0;
}

export async function updateGuildPersonalityProfile(guildId: string, profile: string): Promise<void> {
	container.logger.debug(
		`[guild-personality-db] update-profile start guildId=${guildId} profileLength=${profile.length}`,
	);
	await db
		.insert(guildPersonalityProfiles)
		.values({ guildId, profile, messageCount: 0, lastRefreshedAt: new Date() })
		.onConflictDoUpdate({
			target: guildPersonalityProfiles.guildId,
			set: { profile, messageCount: 0, lastRefreshedAt: new Date() },
		});
	container.logger.debug(`[guild-personality-db] update-profile complete guildId=${guildId}`);
}

export async function getRecentGuildMessages(guildId: string, limit: number): Promise<{ content: string }[]> {
	container.logger.debug(`[guild-personality-db] get-recent-messages start guildId=${guildId} limit=${limit}`);
	const rows = await db.query.userMessages.findMany({
		where: eq(userMessages.guildId, guildId),
		columns: { content: true },
		orderBy: [sql`${userMessages.id} DESC`],
		limit,
	});
	container.logger.debug(`[guild-personality-db] get-recent-messages result guildId=${guildId} count=${rows.length}`);
	return rows;
}

/** Resets the guild message count to a specific value (used for self-healing after failed builds). */
export async function resetGuildMessageCount(guildId: string, count: number): Promise<void> {
	container.logger.debug(`[guild-personality-db] reset-message-count start guildId=${guildId} count=${count}`);
	await db
		.insert(guildPersonalityProfiles)
		.values({ guildId, messageCount: count })
		.onConflictDoUpdate({
			target: guildPersonalityProfiles.guildId,
			set: { messageCount: count },
		});
	container.logger.debug(`[guild-personality-db] reset-message-count complete guildId=${guildId} count=${count}`);
}
