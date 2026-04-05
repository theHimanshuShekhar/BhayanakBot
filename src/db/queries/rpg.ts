import { and, eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import {
	rpgCooldowns,
	rpgInventory,
	rpgOwnedPets,
	rpgOwnedProperties,
	rpgProfiles,
	rpgStats,
} from "../schema.js";

export type RpgProfile = typeof rpgProfiles.$inferSelect;
export type RpgStats = typeof rpgStats.$inferSelect;
export type RpgInventoryItem = typeof rpgInventory.$inferSelect;
export type RpgOwnedPet = typeof rpgOwnedPets.$inferSelect;
export type RpgOwnedProperty = typeof rpgOwnedProperties.$inferSelect;
export type StatKey = "strength" | "intelligence" | "agility" | "charisma" | "luck";

const STAT_COOLDOWN_COL: Record<StatKey, keyof RpgStats> = {
	strength: "strTrainedAt",
	intelligence: "intTrainedAt",
	agility: "agiTrainedAt",
	charisma: "chaTrainedAt",
	luck: "lukTrainedAt",
};

// --- Profile ---

export async function getOrCreateProfile(userId: string): Promise<{ profile: RpgProfile; stats: RpgStats }> {
	let profile = await db.query.rpgProfiles.findFirst({ where: eq(rpgProfiles.userId, userId) });
	let stats = await db.query.rpgStats.findFirst({ where: eq(rpgStats.userId, userId) });

	if (!profile) {
		[profile] = await db.insert(rpgProfiles).values({ userId }).returning();
	}
	if (!stats) {
		[stats] = await db.insert(rpgStats).values({ userId }).returning();
	}
	return { profile, stats };
}

export async function updateCoins(userId: string, delta: number): Promise<void> {
	await db
		.update(rpgProfiles)
		.set({ coins: sql`${rpgProfiles.coins} + ${delta}` })
		.where(eq(rpgProfiles.userId, userId));
}

// --- Stats & Training ---

export async function updateStat(userId: string, stat: StatKey, newValue: number): Promise<void> {
	await db.update(rpgStats).set({ [stat]: newValue }).where(eq(rpgStats.userId, userId));
}

export async function setTrainingCooldown(userId: string, stat: StatKey, trainedAt: Date): Promise<void> {
	const col = STAT_COOLDOWN_COL[stat];
	await db.update(rpgStats).set({ [col]: trainedAt }).where(eq(rpgStats.userId, userId));
}

export function getTrainingCooldownDate(stats: RpgStats, stat: StatKey): Date | null {
	const col = STAT_COOLDOWN_COL[stat];
	return (stats[col] as Date | null) ?? null;
}

// --- Cooldowns ---

export async function getCooldown(userId: string, action: string): Promise<Date | null> {
	const row = await db.query.rpgCooldowns.findFirst({
		where: and(eq(rpgCooldowns.userId, userId), eq(rpgCooldowns.action, action)),
	});
	return row?.expiresAt ?? null;
}

export async function setCooldown(userId: string, action: string, durationMs: number): Promise<void> {
	const expiresAt = new Date(Date.now() + durationMs);
	await db
		.insert(rpgCooldowns)
		.values({ userId, action, expiresAt })
		.onConflictDoUpdate({ target: [rpgCooldowns.userId, rpgCooldowns.action], set: { expiresAt } });
}

export async function clearCooldown(userId: string, action: string): Promise<void> {
	await db
		.delete(rpgCooldowns)
		.where(and(eq(rpgCooldowns.userId, userId), eq(rpgCooldowns.action, action)));
}

// --- Jail ---

export function isInJail(profile: RpgProfile): boolean {
	return profile.jailUntil !== null && profile.jailUntil > new Date();
}

export async function setJail(userId: string, until: Date, bailCost: number): Promise<void> {
	await db.update(rpgProfiles).set({ jailUntil: until, jailBailCost: bailCost }).where(eq(rpgProfiles.userId, userId));
}

export async function clearJail(userId: string): Promise<void> {
	await db.update(rpgProfiles).set({ jailUntil: null, jailBailCost: null }).where(eq(rpgProfiles.userId, userId));
}

// --- Inventory ---

export async function getInventory(userId: string): Promise<RpgInventoryItem[]> {
	return db.query.rpgInventory.findMany({ where: eq(rpgInventory.userId, userId) });
}

export async function addItem(userId: string, itemId: string, quantity = 1): Promise<void> {
	const existing = await db.query.rpgInventory.findFirst({
		where: and(eq(rpgInventory.userId, userId), eq(rpgInventory.itemId, itemId)),
	});
	if (existing) {
		await db
			.update(rpgInventory)
			.set({ quantity: existing.quantity + quantity })
			.where(eq(rpgInventory.id, existing.id));
	} else {
		await db.insert(rpgInventory).values({ userId, itemId, quantity });
	}
}

export async function removeItem(userId: string, itemId: string, quantity = 1): Promise<boolean> {
	const existing = await db.query.rpgInventory.findFirst({
		where: and(eq(rpgInventory.userId, userId), eq(rpgInventory.itemId, itemId)),
	});
	if (!existing || existing.quantity < quantity) return false;
	if (existing.quantity === quantity) {
		await db.delete(rpgInventory).where(eq(rpgInventory.id, existing.id));
	} else {
		await db.update(rpgInventory).set({ quantity: existing.quantity - quantity }).where(eq(rpgInventory.id, existing.id));
	}
	return true;
}

export async function getEquippedTool(userId: string): Promise<string | null> {
	const row = await db.query.rpgInventory.findFirst({
		where: and(eq(rpgInventory.userId, userId), eq(rpgInventory.equippedSlot, "tool")),
	});
	return row?.itemId ?? null;
}

export async function equipItem(userId: string, itemId: string, slot: string): Promise<void> {
	// Unequip any existing item in the same slot first
	await db
		.update(rpgInventory)
		.set({ equippedSlot: null })
		.where(and(eq(rpgInventory.userId, userId), eq(rpgInventory.equippedSlot, slot)));
	// Equip the new item
	await db
		.update(rpgInventory)
		.set({ equippedSlot: slot })
		.where(and(eq(rpgInventory.userId, userId), eq(rpgInventory.itemId, itemId)));
}

// --- Pets ---

export async function getOwnedPets(userId: string): Promise<RpgOwnedPet[]> {
	return db.query.rpgOwnedPets.findMany({ where: eq(rpgOwnedPets.userId, userId) });
}

export async function addPet(userId: string, petId: string): Promise<void> {
	await db.insert(rpgOwnedPets).values({ userId, petId });
}

export async function renamePet(userId: string, petId: string, nickname: string): Promise<boolean> {
	const [row] = await db
		.update(rpgOwnedPets)
		.set({ nickname })
		.where(and(eq(rpgOwnedPets.userId, userId), eq(rpgOwnedPets.petId, petId)))
		.returning({ id: rpgOwnedPets.id });
	return row !== undefined;
}

// --- Properties ---

export async function getOwnedProperties(userId: string): Promise<RpgOwnedProperty[]> {
	return db.query.rpgOwnedProperties.findMany({ where: eq(rpgOwnedProperties.userId, userId) });
}

export async function addProperty(userId: string, propertyId: string): Promise<void> {
	await db.insert(rpgOwnedProperties).values({ userId, propertyId });
}

export async function updateLastCollectedAt(propertyOwnedId: number): Promise<void> {
	await db
		.update(rpgOwnedProperties)
		.set({ lastCollectedAt: new Date() })
		.where(eq(rpgOwnedProperties.id, propertyOwnedId));
}

export async function addXpToProfile(
	userId: string,
	amount: number,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
	const [row] = await db
		.update(rpgProfiles)
		.set({ xp: sql`${rpgProfiles.xp} + ${amount}` })
		.where(eq(rpgProfiles.userId, userId))
		.returning({ xp: rpgProfiles.xp, level: rpgProfiles.level });
	if (!row) throw new Error(`RPG profile not found for userId: ${userId}`);
	// Inline formula to avoid circular import with rewards.ts (which also imports from this file)
	const newLevel = Math.floor(0.05 * Math.sqrt(row.xp));
	const leveledUp = newLevel > row.level;
	if (leveledUp) {
		await db.update(rpgProfiles).set({ level: newLevel }).where(eq(rpgProfiles.userId, userId));
	}
	return { newXp: row.xp, newLevel, leveledUp };
}
