import { eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { guildSettings } from "../schema.js";
import { invalidateGuildSettings } from "../../lib/music/guildSettingsCache.js";

export type GuildSettings = typeof guildSettings.$inferSelect;
export type GuildSettingsInsert = typeof guildSettings.$inferInsert;

export async function getOrCreateSettings(guildId: string): Promise<GuildSettings> {
	const existing = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
	if (existing) return existing;
	const [created] = await db.insert(guildSettings).values({ guildId }).returning();
	return created;
}

export async function updateSettings(guildId: string, values: Partial<GuildSettingsInsert>): Promise<GuildSettings> {
	const [updated] = await db
		.insert(guildSettings)
		.values({ guildId, ...values })
		.onConflictDoUpdate({ target: guildSettings.guildId, set: values })
		.returning();
	invalidateGuildSettings(guildId);
	return updated;
}
