# RPG Module — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the complete RPG database schema, query helpers, static catalogs, helper utilities, and the first two player-facing commands: `/profile` and `/train`.

**Architecture:** All RPG data is global (no guildId). The full DB schema for all 4 phases is created here so later phases only add commands, not migrations. Static game data (items, jobs, pets, properties) lives as TypeScript constants — no DB seeding needed. Two commands ship: `/profile` (view player state) and `/train <stat>` (upgrade stats via cooldown or coins).

**Tech Stack:** Drizzle ORM 0.45 (pg-core), Sapphire Framework v5, Discord.js v14, TypeScript, pnpm, `pnpm db:push` for schema sync.

**Spec:** `docs/superpowers/specs/2026-04-05-rpg-module-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/db/schema.ts` | Add 6 RPG tables |
| Create | `src/db/queries/rpg.ts` | All RPG DB helpers |
| Create | `src/lib/rpg/catalogs/items.ts` | Item catalog constant |
| Create | `src/lib/rpg/catalogs/jobs.ts` | Job catalog constant |
| Create | `src/lib/rpg/catalogs/pets.ts` | Pet catalog constant |
| Create | `src/lib/rpg/catalogs/properties.ts` | Property catalog constant |
| Create | `src/lib/rpg/helpers/outcome.ts` | Success roll formula |
| Create | `src/lib/rpg/helpers/cooldown.ts` | Cooldown check/set helpers |
| Create | `src/lib/rpg/helpers/rewards.ts` | XP/coin grant + loot drop helpers |
| Create | `src/commands/rpg/profile.ts` | `/profile` command |
| Create | `src/commands/rpg/train.ts` | `/train` command |

---

## Task 1: Add RPG tables to schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add `primaryKey` to the schema import**

In `src/db/schema.ts`, change the first import line from:
```typescript
import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
```
to:
```typescript
import { boolean, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Append RPG tables at the bottom of `src/db/schema.ts`**

Add after the last existing table:
```typescript
// --- RPG Module ---

export const rpgProfiles = pgTable("rpg_profiles", {
	userId: varchar("user_id", { length: 20 }).primaryKey(),
	coins: integer("coins").default(0).notNull(),
	level: integer("level").default(1).notNull(),
	xp: integer("xp").default(0).notNull(),
	jailUntil: timestamp("jail_until"),
	jailBailCost: integer("jail_bail_cost"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rpgStats = pgTable("rpg_stats", {
	userId: varchar("user_id", { length: 20 }).primaryKey(),
	strength: integer("strength").default(1).notNull(),
	intelligence: integer("intelligence").default(1).notNull(),
	agility: integer("agility").default(1).notNull(),
	charisma: integer("charisma").default(1).notNull(),
	luck: integer("luck").default(1).notNull(),
	strTrainedAt: timestamp("str_trained_at"),
	intTrainedAt: timestamp("int_trained_at"),
	agiTrainedAt: timestamp("agi_trained_at"),
	chaTrainedAt: timestamp("cha_trained_at"),
	lukTrainedAt: timestamp("luk_trained_at"),
});

export const rpgCooldowns = pgTable(
	"rpg_cooldowns",
	{
		userId: varchar("user_id", { length: 20 }).notNull(),
		action: varchar("action", { length: 50 }).notNull(),
		expiresAt: timestamp("expires_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.action] })],
);

export const rpgInventory = pgTable("rpg_inventory", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	itemId: varchar("item_id", { length: 50 }).notNull(),
	quantity: integer("quantity").default(1).notNull(),
	equippedSlot: varchar("equipped_slot", { length: 30 }),
});

export const rpgOwnedPets = pgTable("rpg_owned_pets", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	petId: varchar("pet_id", { length: 50 }).notNull(),
	nickname: varchar("nickname", { length: 32 }),
	acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
});

export const rpgOwnedProperties = pgTable("rpg_owned_properties", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	propertyId: varchar("property_id", { length: 50 }).notNull(),
	purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
	lastCollectedAt: timestamp("last_collected_at").defaultNow().notNull(),
});
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
pnpm build
```
Expected: no errors. If `primaryKey` import gives a type error, confirm drizzle-orm version supports the array syntax (`(t) => [primaryKey(...)]`).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(rpg): add RPG tables to database schema"
```

---

## Task 2: RPG query helpers

**Files:**
- Create: `src/db/queries/rpg.ts`

- [ ] **Step 1: Create `src/db/queries/rpg.ts`**

```typescript
import { and, eq, gt, sql } from "drizzle-orm";
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

export async function getStat(stats: RpgStats, stat: StatKey): Promise<number> {
	return stats[stat] as number;
}

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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/rpg.ts
git commit -m "feat(rpg): add RPG query helpers"
```

---

## Task 3: Static catalogs

**Files:**
- Create: `src/lib/rpg/catalogs/items.ts`
- Create: `src/lib/rpg/catalogs/jobs.ts`
- Create: `src/lib/rpg/catalogs/pets.ts`
- Create: `src/lib/rpg/catalogs/properties.ts`

- [ ] **Step 1: Create `src/lib/rpg/catalogs/items.ts`**

```typescript
export type ItemSlot = "tool" | "consumable" | "collectible";

export type Item = {
	id: string;
	name: string;
	description: string;
	price: number; // 0 = not buyable (drop-only)
	slot: ItemSlot | null;
	effect?: { stat: string; bonusPercent: number; durationMs: number }; // consumables
	dropRate?: number; // 0–1 chance to appear in a job drop
};

export const ITEMS: Record<string, Item> = {
	fishing_rod: {
		id: "fishing_rod",
		name: "Fishing Rod",
		description: "Required for fishing. Without it, catches are unreliable.",
		price: 200,
		slot: "tool",
	},
	pickaxe: {
		id: "pickaxe",
		name: "Pickaxe",
		description: "Required for mining. Going in empty-handed is dangerous.",
		price: 500,
		slot: "tool",
	},
	lockpick: {
		id: "lockpick",
		name: "Lockpick",
		description: "Improves success on theft and robbery.",
		price: 300,
		slot: "tool",
	},
	briefcase: {
		id: "briefcase",
		name: "Briefcase",
		description: "Projects professionalism. Helps with white-collar work.",
		price: 800,
		slot: "tool",
	},
	energy_drink: {
		id: "energy_drink",
		name: "Energy Drink",
		description: "Reduces your next job cooldown by 30 minutes.",
		price: 100,
		slot: "consumable",
	},
	lucky_charm: {
		id: "lucky_charm",
		name: "Lucky Charm",
		description: "Grants +10% success chance on your next action.",
		price: 250,
		slot: "consumable",
	},
	jail_key: {
		id: "jail_key",
		name: "Jail Key",
		description: "A mysterious key. Guarantees escape from jail.",
		price: 1500,
		slot: "consumable",
	},
	rare_gem: {
		id: "rare_gem",
		name: "Rare Gem",
		description: "A glittering gem found in the deep mines. Sell it for a profit.",
		price: 0,
		slot: "collectible",
		dropRate: 0.05,
	},
	old_coin: {
		id: "old_coin",
		name: "Old Coin",
		description: "An ancient coin found while fishing. Worth something to collectors.",
		price: 0,
		slot: "collectible",
		dropRate: 0.08,
	},
};

export function getItem(id: string): Item | undefined {
	return ITEMS[id];
}

export function getBuyableItems(): Item[] {
	return Object.values(ITEMS).filter((i) => i.price > 0);
}
```

- [ ] **Step 2: Create `src/lib/rpg/catalogs/jobs.ts`**

```typescript
import type { StatKey } from "../../../db/queries/rpg.js";

export type JobCategory = "fishing" | "blue_collar" | "white_collar" | "crime";

export type Job = {
	id: string;
	name: string;
	category: JobCategory;
	description: string;
	statRequirements: Partial<Record<StatKey, number>>;
	/** itemId: can attempt without stat gate but base success halved */
	toolBypass?: string;
	/** 0–1: base success chance before stat influence */
	baseSuccessChance: number;
	payRange: [number, number];
	cooldownMs: number;
	xpReward: number;
	dropTable: string[]; // itemIds eligible to drop
	/** crime jobs only — jail sentence on failure */
	jailSentenceMs?: number;
};

export const JOBS: Record<string, Job> = {
	fishing: {
		id: "fishing",
		name: "Fishing",
		category: "fishing",
		description: "Cast a line and hope for the best.",
		statRequirements: {},
		toolBypass: "fishing_rod",
		baseSuccessChance: 0.75,
		payRange: [50, 200],
		cooldownMs: 5 * 60 * 1000,
		xpReward: 10,
		dropTable: ["old_coin"],
	},
	construction: {
		id: "construction",
		name: "Construction",
		category: "blue_collar",
		description: "Hard manual labour. Requires a strong back.",
		statRequirements: { strength: 30 },
		baseSuccessChance: 0.7,
		payRange: [150, 400],
		cooldownMs: 15 * 60 * 1000,
		xpReward: 20,
		dropTable: [],
	},
	delivery: {
		id: "delivery",
		name: "Delivery Driver",
		category: "blue_collar",
		description: "Fast hands and faster feet.",
		statRequirements: { agility: 20 },
		baseSuccessChance: 0.72,
		payRange: [100, 300],
		cooldownMs: 10 * 60 * 1000,
		xpReward: 15,
		dropTable: [],
	},
	mining: {
		id: "mining",
		name: "Mining",
		category: "blue_collar",
		description: "Dig deep, find treasure. Dangerous without proper tools.",
		statRequirements: { strength: 50 },
		toolBypass: "pickaxe",
		baseSuccessChance: 0.65,
		payRange: [200, 600],
		cooldownMs: 30 * 60 * 1000,
		xpReward: 35,
		dropTable: ["rare_gem"],
	},
	programmer: {
		id: "programmer",
		name: "Programmer",
		category: "white_collar",
		description: "Ship code. Get paid. Sleep at your desk.",
		statRequirements: { intelligence: 60 },
		baseSuccessChance: 0.68,
		payRange: [500, 1200],
		cooldownMs: 60 * 60 * 1000,
		xpReward: 60,
		dropTable: [],
	},
	lawyer: {
		id: "lawyer",
		name: "Lawyer",
		category: "white_collar",
		description: "Argue with authority. Win with words.",
		statRequirements: { intelligence: 70, charisma: 50 },
		baseSuccessChance: 0.62,
		payRange: [800, 2000],
		cooldownMs: 2 * 60 * 60 * 1000,
		xpReward: 80,
		dropTable: [],
	},
	doctor: {
		id: "doctor",
		name: "Doctor",
		category: "white_collar",
		description: "Heal people. Charge them anyway.",
		statRequirements: { intelligence: 80 },
		baseSuccessChance: 0.6,
		payRange: [1000, 2500],
		cooldownMs: 2 * 60 * 60 * 1000,
		xpReward: 100,
		dropTable: [],
	},
	pickpocket: {
		id: "pickpocket",
		name: "Pickpocket",
		category: "crime",
		description: "Nimble fingers, empty wallets.",
		statRequirements: {},
		baseSuccessChance: 0.55,
		payRange: [20, 100],
		cooldownMs: 10 * 60 * 1000,
		xpReward: 8,
		dropTable: [],
		jailSentenceMs: 5 * 60 * 1000,
	},
	rob_player: {
		id: "rob_player",
		name: "Rob Player",
		category: "crime",
		description: "Bold move. Steal directly from another player.",
		statRequirements: { agility: 30 },
		baseSuccessChance: 0.45,
		payRange: [100, 500],
		cooldownMs: 30 * 60 * 1000,
		xpReward: 25,
		dropTable: [],
		jailSentenceMs: 20 * 60 * 1000,
	},
	rob_bank: {
		id: "rob_bank",
		name: "Rob Bank",
		category: "crime",
		description: "The big score. High risk, legendary reward.",
		statRequirements: { intelligence: 60, agility: 50 },
		baseSuccessChance: 0.3,
		payRange: [2000, 8000],
		cooldownMs: 6 * 60 * 60 * 1000,
		xpReward: 200,
		dropTable: [],
		jailSentenceMs: 2 * 60 * 60 * 1000,
	},
};

export function getJob(id: string): Job | undefined {
	return JOBS[id];
}

export function getJobsByCategory(category: JobCategory): Job[] {
	return Object.values(JOBS).filter((j) => j.category === category);
}
```

- [ ] **Step 3: Create `src/lib/rpg/catalogs/pets.ts`**

```typescript
export type PetRarity = "common" | "uncommon" | "rare" | "legendary";

export type Pet = {
	id: string;
	name: string;
	rarity: PetRarity;
	description: string;
	price: number; // 0 = not buyable (event/drop only)
	emoji: string;
	// Reserved for Phase 5 battle system — not used yet
	baseStats?: { hp: number; attack: number; defense: number; speed: number };
};

export const PETS: Record<string, Pet> = {
	cat: {
		id: "cat",
		name: "Stray Cat",
		rarity: "common",
		description: "Found it behind the dumpster. It looks unimpressed.",
		price: 500,
		emoji: "🐱",
	},
	dog: {
		id: "dog",
		name: "Loyal Dog",
		rarity: "common",
		description: "Always happy to see you, even after a jail stint.",
		price: 600,
		emoji: "🐶",
	},
	parrot: {
		id: "parrot",
		name: "Parrot",
		rarity: "uncommon",
		description: "Repeats everything. Knows too much.",
		price: 1200,
		emoji: "🦜",
	},
	fox: {
		id: "fox",
		name: "Fox",
		rarity: "uncommon",
		description: "Sly and stylish. The perfect crime companion.",
		price: 1500,
		emoji: "🦊",
	},
	dragon: {
		id: "dragon",
		name: "Mini Dragon",
		rarity: "rare",
		description: "Don't ask where it came from. It breathes sparks.",
		price: 5000,
		emoji: "🐉",
	},
	phoenix: {
		id: "phoenix",
		name: "Phoenix",
		rarity: "legendary",
		description: "Rises from the ashes. So will your wallet.",
		price: 0, // event-only
		emoji: "🔥",
	},
};

export function getPet(id: string): Pet | undefined {
	return PETS[id];
}

export function getBuyablePets(): Pet[] {
	return Object.values(PETS).filter((p) => p.price > 0);
}
```

- [ ] **Step 4: Create `src/lib/rpg/catalogs/properties.ts`**

```typescript
export type PropertyCategory = "house" | "business";

export type Property = {
	id: string;
	name: string;
	category: PropertyCategory;
	description: string;
	price: number;
	incomePerHour: number; // coins per hour, 0 = cosmetic only
	storageBonus: number;  // extra inventory slots
	emoji: string;
};

export const PROPERTIES: Record<string, Property> = {
	studio_apartment: {
		id: "studio_apartment",
		name: "Studio Apartment",
		category: "house",
		description: "Small but yours. A place to call home.",
		price: 5000,
		incomePerHour: 0,
		storageBonus: 5,
		emoji: "🏠",
	},
	townhouse: {
		id: "townhouse",
		name: "Townhouse",
		category: "house",
		description: "A proper house. Extra storage for your loot.",
		price: 15000,
		incomePerHour: 0,
		storageBonus: 15,
		emoji: "🏡",
	},
	mansion: {
		id: "mansion",
		name: "Mansion",
		category: "house",
		description: "The flex of flexes.",
		price: 75000,
		incomePerHour: 50,
		storageBonus: 30,
		emoji: "🏰",
	},
	food_stall: {
		id: "food_stall",
		name: "Food Stall",
		category: "business",
		description: "Humble, honest income.",
		price: 3000,
		incomePerHour: 30,
		storageBonus: 0,
		emoji: "🍜",
	},
	convenience_store: {
		id: "convenience_store",
		name: "Convenience Store",
		category: "business",
		description: "Open 24/7. Employees mandatory.",
		price: 10000,
		incomePerHour: 100,
		storageBonus: 0,
		emoji: "🏪",
	},
	nightclub: {
		id: "nightclub",
		name: "Nightclub",
		category: "business",
		description: "High overhead. Higher income.",
		price: 50000,
		incomePerHour: 400,
		storageBonus: 0,
		emoji: "🎵",
	},
};

export function getProperty(id: string): Property | undefined {
	return PROPERTIES[id];
}

export function getBuyableProperties(): Property[] {
	return Object.values(PROPERTIES);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rpg/catalogs/
git commit -m "feat(rpg): add static item, job, pet, and property catalogs"
```

---

## Task 4: Helper utilities

**Files:**
- Create: `src/lib/rpg/helpers/outcome.ts`
- Create: `src/lib/rpg/helpers/cooldown.ts`
- Create: `src/lib/rpg/helpers/rewards.ts`

- [ ] **Step 1: Create `src/lib/rpg/helpers/outcome.ts`**

```typescript
import type { RpgStats, StatKey } from "../../../db/queries/rpg.js";

export type OutcomeContext = {
	baseSuccessChance: number;
	relevantStats: StatKey[];
	stats: RpgStats;
	/** If true, base chance is halved (tool bypass without stat gate) */
	toolBypass?: boolean;
	/** Flat bonus from consumables (e.g. lucky_charm = 0.1) */
	consumableBonus?: number;
};

/**
 * Rolls outcome for a single-turn action.
 * - Stat bonus: each relevant stat contributes (stat - 50) * 0.003 (max ±15% per stat)
 * - Hard cap: 5% ≤ finalChance ≤ 70%
 * - Returns { success, finalChance }
 */
export function rollOutcome(ctx: OutcomeContext): { success: boolean; finalChance: number } {
	let base = ctx.baseSuccessChance;
	if (ctx.toolBypass) base *= 0.6;

	let statBonus = 0;
	for (const stat of ctx.relevantStats) {
		const value = ctx.stats[stat] as number;
		statBonus += (value - 50) * 0.003;
	}

	const consumable = ctx.consumableBonus ?? 0;
	const raw = base + statBonus + consumable;
	const finalChance = Math.max(0.05, Math.min(0.7, raw));
	const success = Math.random() < finalChance;

	return { success, finalChance };
}

/** Returns a random integer between min and max (inclusive) */
export function randomPay(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

- [ ] **Step 2: Create `src/lib/rpg/helpers/cooldown.ts`**

```typescript
import { getCooldown, setCooldown } from "../../../db/queries/rpg.js";

/** Returns remaining ms on a cooldown, or 0 if not on cooldown */
export async function getRemainingCooldown(userId: string, action: string): Promise<number> {
	const expiresAt = await getCooldown(userId, action);
	if (!expiresAt) return 0;
	const remaining = expiresAt.getTime() - Date.now();
	return remaining > 0 ? remaining : 0;
}

/** Formats milliseconds as a human-readable string: "1h 23m 45s" */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.ceil(ms / 1000);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	return parts.join(" ");
}

export { setCooldown };
```

- [ ] **Step 3: Create `src/lib/rpg/helpers/rewards.ts`**

```typescript
import { addItem, updateCoins } from "../../../db/queries/rpg.js";
import { ITEMS } from "../catalogs/items.js";

/**
 * Grants XP toward the RPG profile level.
 * XP formula: level = floor(0.05 * sqrt(xp)) — reachable solo via /work.
 * Returns { newXp, newLevel, leveledUp }.
 */
export function calculateLevel(xp: number): number {
	return Math.floor(0.05 * Math.sqrt(xp));
}

/**
 * Rolls loot drops from a job's dropTable.
 * Each item in the table is rolled independently at its dropRate.
 * Returns list of itemIds that dropped.
 */
export function rollDrops(dropTable: string[]): string[] {
	const dropped: string[] = [];
	for (const itemId of dropTable) {
		const item = ITEMS[itemId];
		if (item?.dropRate && Math.random() < item.dropRate) {
			dropped.push(itemId);
		}
	}
	return dropped;
}

/**
 * Applies coins + item drops to a player after a successful job.
 * Returns dropped item ids for display.
 */
export async function applyJobRewards(
	userId: string,
	coins: number,
	dropTable: string[],
): Promise<{ droppedItems: string[] }> {
	await updateCoins(userId, coins);
	const droppedItems = rollDrops(dropTable);
	for (const itemId of droppedItems) {
		await addItem(userId, itemId);
	}
	return { droppedItems };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rpg/helpers/
git commit -m "feat(rpg): add outcome, cooldown, and rewards helpers"
```

---

## Task 5: `/profile` command

**Files:**
- Create: `src/commands/rpg/profile.ts`

- [ ] **Step 1: Create `src/commands/rpg/profile.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateProfile, isInJail } from "../../db/queries/rpg.js";
import { getPet } from "../../lib/rpg/catalogs/pets.js";
import { getOwnedPets } from "../../db/queries/rpg.js";

export class ProfileCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("profile")
				.setDescription("View your RPG profile or another player's")
				.addUserOption((opt) =>
					opt.setName("user").setDescription("Player to view").setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();
		const target = interaction.options.getUser("user") ?? interaction.user;

		const { profile, stats } = await getOrCreateProfile(target.id);
		const ownedPets = await getOwnedPets(target.id);

		const statBar = (value: number) => {
			const filled = Math.round((value / 100) * 10);
			return `\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${value}/100`;
		};

		const jailed = isInJail(profile);
		const jailText = jailed && profile.jailUntil
			? `🔒 In jail until <t:${Math.floor(profile.jailUntil.getTime() / 1000)}:R>`
			: "🆓 Free";

		const xpForNextLevel = Math.pow((profile.level + 1) / 0.05, 2);
		const xpForCurrentLevel = Math.pow(profile.level / 0.05, 2);
		const progress = profile.xp - xpForCurrentLevel;
		const needed = xpForNextLevel - xpForCurrentLevel;
		const barFilled = Math.round((progress / needed) * 15);
		const xpBar = `\`${"█".repeat(barFilled)}${"░".repeat(15 - barFilled)}\` ${Math.round(progress)}/${Math.round(needed)}`;

		const petDisplay = ownedPets.length > 0
			? ownedPets
				.slice(0, 3)
				.map((op) => {
					const pet = getPet(op.petId);
					return `${pet?.emoji ?? "🐾"} ${op.nickname ?? pet?.name ?? op.petId}`;
				})
				.join(", ") + (ownedPets.length > 3 ? ` +${ownedPets.length - 3} more` : "")
			: "None";

		const embed = new EmbedBuilder()
			.setTitle(`${target.displayName}'s RPG Profile`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x5865f2)
			.addFields(
				{ name: "💰 Coins", value: `${profile.coins.toLocaleString()}`, inline: true },
				{ name: "⭐ Level", value: `${profile.level}`, inline: true },
				{ name: "🔑 Status", value: jailText, inline: true },
				{ name: `📈 XP Progress to Level ${profile.level + 1}`, value: xpBar },
				{ name: "⚔️ Strength", value: statBar(stats.strength), inline: true },
				{ name: "🧠 Intelligence", value: statBar(stats.intelligence), inline: true },
				{ name: "💨 Agility", value: statBar(stats.agility), inline: true },
				{ name: "🗣️ Charisma", value: statBar(stats.charisma), inline: true },
				{ name: "🍀 Luck", value: statBar(stats.luck), inline: true },
				{ name: "🐾 Pets", value: petDisplay, inline: true },
			)
			.setFooter({ text: `Total XP: ${profile.xp.toLocaleString()}` });

		return interaction.editReply({ embeds: [embed] });
	}
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/profile.ts
git commit -m "feat(rpg): add /profile command"
```

---

## Task 6: `/train` command

**Files:**
- Create: `src/commands/rpg/train.ts`

- [ ] **Step 1: Create `src/commands/rpg/train.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateProfile, updateCoins, updateStat, setTrainingCooldown, getTrainingCooldownDate, type StatKey } from "../../db/queries/rpg.js";
import { formatDuration } from "../../lib/rpg/helpers/cooldown.js";

const TRAINING_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const STAT_CAP = 100;

const STAT_CHOICES: { name: string; value: StatKey }[] = [
	{ name: "Strength", value: "strength" },
	{ name: "Intelligence", value: "intelligence" },
	{ name: "Agility", value: "agility" },
	{ name: "Charisma", value: "charisma" },
	{ name: "Luck", value: "luck" },
];

const STAT_EMOJI: Record<StatKey, string> = {
	strength: "⚔️",
	intelligence: "🧠",
	agility: "💨",
	charisma: "🗣️",
	luck: "🍀",
};

export class TrainCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("train")
				.setDescription("Train one of your RPG stats")
				.addStringOption((opt) =>
					opt
						.setName("stat")
						.setDescription("Which stat to train")
						.setRequired(true)
						.addChoices(...STAT_CHOICES),
				)
				.addBooleanOption((opt) =>
					opt
						.setName("pay")
						.setDescription("Pay coins to skip the cooldown")
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const stat = interaction.options.getString("stat", true) as StatKey;
		const pay = interaction.options.getBoolean("pay") ?? false;

		const { profile, stats } = await getOrCreateProfile(interaction.user.id);
		const currentValue = stats[stat] as number;

		if (currentValue >= STAT_CAP) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setDescription(`${STAT_EMOJI[stat]} **${stat.charAt(0).toUpperCase() + stat.slice(1)}** is already maxed at ${STAT_CAP}!`),
				],
			});
		}

		const gainAmount = Math.random() < 0.5 ? 1 : 2;
		const newValue = Math.min(STAT_CAP, currentValue + gainAmount);

		if (pay) {
			const cost = Math.floor(currentValue * 15);
			if (profile.coins < cost) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(`❌ You need **${cost.toLocaleString()} coins** to pay-train ${stat}, but you only have **${profile.coins.toLocaleString()}**.`),
					],
				});
			}
			// Deduct coins and apply stat gain
			await updateCoins(interaction.user.id, -cost);
			await updateStat(interaction.user.id, stat, newValue);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle(`${STAT_EMOJI[stat]} Pay Training — ${stat.charAt(0).toUpperCase() + stat.slice(1)}`)
						.addFields(
							{ name: "Stat Gain", value: `+${gainAmount} → **${newValue}/100**`, inline: true },
							{ name: "Cost", value: `${cost.toLocaleString()} coins`, inline: true },
						),
				],
			});
		}

		// Free training — check cooldown
		const lastTrained = getTrainingCooldownDate(stats, stat);
		if (lastTrained) {
			const remaining = lastTrained.getTime() + TRAINING_COOLDOWN_MS - Date.now();
			if (remaining > 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setDescription(`⏳ ${STAT_EMOJI[stat]} **${stat.charAt(0).toUpperCase() + stat.slice(1)}** is still recovering. Ready in **${formatDuration(remaining)}**.`),
					],
				});
			}
		}

		await updateStat(interaction.user.id, stat, newValue);
		await setTrainingCooldown(interaction.user.id, stat, new Date());

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle(`${STAT_EMOJI[stat]} Training — ${stat.charAt(0).toUpperCase() + stat.slice(1)}`)
					.addFields(
						{ name: "Stat Gain", value: `+${gainAmount} → **${newValue}/100**`, inline: true },
						{ name: "Next Free Train", value: `in ${formatDuration(TRAINING_COOLDOWN_MS)}`, inline: true },
					),
			],
		});
	}
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/train.ts
git commit -m "feat(rpg): add /train command"
```

---

## Task 7: DB migration + end-to-end verification

- [ ] **Step 1: Push schema to database**

```bash
pnpm db:push
```
Expected: Drizzle prompts to create 6 new tables (`rpg_profiles`, `rpg_stats`, `rpg_cooldowns`, `rpg_inventory`, `rpg_owned_pets`, `rpg_owned_properties`). Confirm all. No existing tables should be modified.

- [ ] **Step 2: Start the bot**

```bash
pnpm dev
```
Expected: Bot starts without errors. Sapphire auto-discovers `/profile` and `/train` from `src/commands/rpg/`.

- [ ] **Step 3: Verify `/profile` — new user**

In any Discord server: run `/profile`

Expected embed shows:
- Coins: 0
- Level: 1
- Status: 🆓 Free
- All stats at 1/100 (empty bars)
- Pets: None

- [ ] **Step 4: Verify `/train strength` — free path**

Run `/train stat:Strength`

Expected:
- Ephemeral reply showing +1 or +2 stat gain
- "Next Free Train in 4h"
- Running `/profile` after shows Strength updated

- [ ] **Step 5: Verify `/train strength` — on cooldown**

Run `/train stat:Strength` again immediately

Expected:
- Ephemeral reply: "⏳ Still recovering. Ready in ~4h"

- [ ] **Step 6: Verify `/train intelligence pay:True` — insufficient coins**

Run `/train stat:Intelligence pay:True` (with 0 coins)

Expected:
- Ephemeral reply: "❌ You need X coins..."

- [ ] **Step 7: Commit final verification note**

```bash
git commit --allow-empty -m "chore(rpg): phase 1 verified end-to-end"
```

---

## Phase 2 Preview

Phase 2 plan (`2026-04-05-rpg-phase2-jobs-economy.md`) will cover:
- `/work <job>` — job execution with stat gates, cooldowns, loot drops
- `/shop browse|buy|sell` — item shop with pagination
- `/inventory view|use|equip` — inventory management
- `src/interaction-handlers/rpgShopSelect.ts` — shop pagination buttons

Phase 3: `/crime` + jail interaction handler + Ollama flavor text  
Phase 4: `/pet` + `/property` + `collectPropertyIncome` scheduled task
