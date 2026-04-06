import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import {
	dailyQuests,
	petPortraits,
	questProgress,
	rpgCooldowns,
	rpgInventory,
	rpgOwnedPets,
	rpgOwnedProperties,
	rpgProfiles,
	rpgStats,
} from "../schema.js";

export type DailyQuest = typeof dailyQuests.$inferSelect;
export type QuestProgress = typeof questProgress.$inferSelect;
export type PetPortrait = typeof petPortraits.$inferSelect;

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

/**
 * Atomically deduct `amount` coins from a user.
 * Returns the new coin balance, or null if the user had insufficient funds.
 */
export async function tryDebitCoins(userId: string, amount: number): Promise<number | null> {
	const [row] = await db
		.update(rpgProfiles)
		.set({ coins: sql`${rpgProfiles.coins} - ${amount}` })
		.where(and(eq(rpgProfiles.userId, userId), sql`${rpgProfiles.coins} >= ${amount}`))
		.returning({ coins: rpgProfiles.coins });
	return row?.coins ?? null;
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

// --- Active Pet ---

export async function getActivePet(userId: string): Promise<RpgOwnedPet | null> {
	return (await db.query.rpgOwnedPets.findFirst({ where: eq(rpgOwnedPets.userId, userId) })) ?? null;
}

// --- Portrait ---

export async function setPortraitUrl(userId: string, url: string): Promise<void> {
	await db.update(rpgProfiles).set({ portraitUrl: url }).where(eq(rpgProfiles.userId, userId));
}

// --- Daily Quests ---

export async function getTodayQuests(guildId: string, date: string): Promise<DailyQuest[]> {
	return db.query.dailyQuests.findMany({
		where: and(eq(dailyQuests.guildId, guildId), eq(dailyQuests.date, date)),
	});
}

export async function insertDailyQuests(quests: (typeof dailyQuests.$inferInsert)[]): Promise<void> {
	await db.insert(dailyQuests).values(quests);
}

export async function getUserQuestProgress(userId: string, questIds: number[]): Promise<QuestProgress[]> {
	if (questIds.length === 0) return [];
	return db.query.questProgress.findMany({
		where: and(eq(questProgress.userId, userId), inArray(questProgress.questId, questIds)),
	});
}

export async function upsertQuestProgress(
	questId: number,
	userId: string,
	guildId: string,
	progress: number,
	completedAt?: Date,
): Promise<void> {
	await db
		.insert(questProgress)
		.values({ questId, userId, guildId, progress, completedAt })
		.onConflictDoUpdate({
			target: [questProgress.questId, questProgress.userId],
			set: { progress, completedAt: completedAt ?? null },
		});
}

export async function checkAndAdvanceQuestProgress(opts: {
	userId: string;
	guildId: string;
	objectiveType: "work" | "crime" | "train";
	objectiveJob: string;
	onComplete: (quest: DailyQuest) => Promise<void>;
}): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);
	const quests = await getTodayQuests(opts.guildId, today);
	if (quests.length === 0) return;

	const matching = quests.filter(
		(q) => q.objectiveType === opts.objectiveType && (q.objectiveJob === null || q.objectiveJob === opts.objectiveJob),
	);
	if (matching.length === 0) return;

	const progressRows = await getUserQuestProgress(opts.userId, matching.map((q) => q.id));
	const progressMap = new Map(progressRows.map((p) => [p.questId, p]));

	for (const quest of matching) {
		const existing = progressMap.get(quest.id);
		if (existing?.completedAt) continue; // already done

		const currentProgress = existing?.progress ?? 0;
		const newProgress = currentProgress + 1;
		const completedAt = newProgress >= quest.objectiveCount ? new Date() : undefined;

		await upsertQuestProgress(quest.id, opts.userId, opts.guildId, newProgress, completedAt);

		if (completedAt) {
			await updateCoins(opts.userId, quest.rewardCoins);
			const [updated] = await db
				.update(rpgProfiles)
				.set({
					xp: sql`${rpgProfiles.xp} + ${quest.rewardXp}`,
					level: sql`FLOOR(0.05 * SQRT(${rpgProfiles.xp} + ${quest.rewardXp}))::int`,
				})
				.where(eq(rpgProfiles.userId, opts.userId))
				.returning({ level: rpgProfiles.level });
			void updated; // level-up notification handled by caller if desired
			await opts.onComplete(quest);
		}
	}
}

// --- Pet Portraits ---

export async function getPetPortrait(petId: string): Promise<PetPortrait | null> {
	return (await db.query.petPortraits.findFirst({ where: eq(petPortraits.petId, petId) })) ?? null;
}

export async function upsertPetPortrait(petId: string, imageUrl: string): Promise<void> {
	await db
		.insert(petPortraits)
		.values({ petId, imageUrl })
		.onConflictDoUpdate({ target: petPortraits.petId, set: { imageUrl, generatedAt: new Date() } });
}

export async function addXpToProfile(
	userId: string,
	amount: number,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
	const [row] = await db
		.update(rpgProfiles)
		.set({
			xp: sql`${rpgProfiles.xp} + ${amount}`,
			level: sql`FLOOR(0.05 * SQRT(${rpgProfiles.xp} + ${amount}))::int`,
		})
		.where(eq(rpgProfiles.userId, userId))
		.returning({ xp: rpgProfiles.xp, level: rpgProfiles.level });
	if (!row) throw new Error(`RPG profile not found for userId: ${userId}`);
	const oldLevel = Math.floor(0.05 * Math.sqrt(row.xp - amount));
	const leveledUp = row.level > oldLevel;
	return { newXp: row.xp, newLevel: row.level, leveledUp };
}
