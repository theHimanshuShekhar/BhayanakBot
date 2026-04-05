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
