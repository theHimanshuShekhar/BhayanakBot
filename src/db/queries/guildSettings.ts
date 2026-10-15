import { eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import {
	getCachedGuildSettings,
	guildSettingsEpoch,
	invalidateGuildSettings,
	setCachedGuildSettings,
} from "../../lib/music/guildSettingsCache.js";
import { guildSettings } from "../schema.js";

export type GuildSettings = typeof guildSettings.$inferSelect;
export type GuildSettingsInsert = typeof guildSettings.$inferInsert;

/** Cached for 60 seconds (see guildSettingsCache.ts); updateSettings invalidates. Safe to call concurrently. */
export async function getOrCreateSettings(guildId: string): Promise<GuildSettings> {
	const cached = getCachedGuildSettings(guildId);
	if (cached) return cached;

	const readEpoch = guildSettingsEpoch();
	let settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
	if (!settings) {
		// Two first messages in a new guild race to insert; the loser's insert is a no-op and both then read the one row.
		await db.insert(guildSettings).values({ guildId }).onConflictDoNothing({ target: guildSettings.guildId });
		settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
		if (!settings) throw new Error(`guild_settings row for ${guildId} vanished after insert`);
	}
	setCachedGuildSettings(guildId, settings, readEpoch);
	return settings;
}

export async function getAllActiveGuildIds(): Promise<string[]> {
	const rows = await db.selectDistinct({ guildId: guildSettings.guildId }).from(guildSettings);
	return rows.map((r) => r.guildId);
}

export async function updateSettings(guildId: string, values: Partial<GuildSettingsInsert>): Promise<GuildSettings> {
	// An empty SET clause is invalid SQL; with nothing to change the row is just ensured to exist.
	if (Object.keys(values).length === 0) return getOrCreateSettings(guildId);
	const [updated] = await db
		.insert(guildSettings)
		.values({ guildId, ...values })
		.onConflictDoUpdate({ target: guildSettings.guildId, set: values })
		.returning();
	invalidateGuildSettings(guildId);
	return updated;
}
