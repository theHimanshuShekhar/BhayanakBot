export type PropertyCategory = "house" | "business";

export type Property = {
	id: string;
	name: string;
	category: PropertyCategory;
	description: string;
	price: number;
	incomePerHour: number; // coins per hour, 0 = cosmetic only
	storageBonus: number; // extra inventory slots
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
