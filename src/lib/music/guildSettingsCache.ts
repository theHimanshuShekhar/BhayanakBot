import { eq } from "drizzle-orm";
import { guildSettings } from "../../db/schema.js";
import { BoundedMap } from "../BhayanakClient.js";
import { db } from "../database.js";

type GuildSettingsRow = typeof guildSettings.$inferSelect;

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

interface CacheEntry {
	value: GuildSettingsRow | null;
	expiresAt: number;
}

const cache = new BoundedMap<string, CacheEntry>(MAX_ENTRIES);

export async function getGuildSettingsCached(guildId: string): Promise<GuildSettingsRow | null> {
	const entry = cache.get(guildId);
	if (entry && entry.expiresAt > Date.now()) return entry.value;

	const value = (await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) })) ?? null;
	cache.set(guildId, { value, expiresAt: Date.now() + TTL_MS });
	return value;
}

export function invalidateGuildSettings(guildId: string): void {
	cache.delete(guildId);
}
