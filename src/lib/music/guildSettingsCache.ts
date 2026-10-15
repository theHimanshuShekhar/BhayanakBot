import { eq } from "drizzle-orm";
import { guildSettings } from "../../db/schema.js";
import { BoundedMap } from "../BhayanakClient.js";
import { db } from "../database.js";

type GuildSettingsRow = typeof guildSettings.$inferSelect;

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

interface CacheEntry {
	value: GuildSettingsRow;
	expiresAt: number;
}

// Shared with getOrCreateSettings. Safe because the bot is a single instance (docs/adr/0005) and
// updateSettings, the only writer, invalidates; the TTL bounds staleness from manual database edits.
const cache = new BoundedMap<string, CacheEntry>(MAX_ENTRIES);

// Bumped on every invalidation so a read that began before an update cannot cache its stale row afterwards.
let epoch = 0;

export function getCachedGuildSettings(guildId: string): GuildSettingsRow | undefined {
	const entry = cache.get(guildId);
	if (entry && entry.expiresAt > Date.now()) return entry.value;
	return undefined;
}

/** Call before reading the row from the database, and pass the result to setCachedGuildSettings. */
export function guildSettingsEpoch(): number {
	return epoch;
}

export function setCachedGuildSettings(guildId: string, value: GuildSettingsRow, readEpoch: number): void {
	if (readEpoch !== epoch) return;
	cache.set(guildId, { value, expiresAt: Date.now() + TTL_MS });
}

/** Reads without creating the row. A guild with no row is not cached, so its first update is seen at once. */
export async function getGuildSettingsCached(guildId: string): Promise<GuildSettingsRow | null> {
	const cached = getCachedGuildSettings(guildId);
	if (cached) return cached;

	const readEpoch = guildSettingsEpoch();
	const value = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
	if (!value) return null;
	setCachedGuildSettings(guildId, value, readEpoch);
	return value;
}

export function invalidateGuildSettings(guildId: string): void {
	epoch++;
	cache.delete(guildId);
}
