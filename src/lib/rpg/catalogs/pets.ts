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
