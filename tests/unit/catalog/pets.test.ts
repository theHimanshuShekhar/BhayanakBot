import { describe, expect, it } from "vitest";
import { PETS } from "../../../src/lib/rpg/catalogs/pets.js";

describe("pets catalog consistency", () => {
	it("has unique pet IDs", () => {
		const ids = Object.values(PETS).map((p) => p.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("has non-negative prices", () => {
		for (const pet of Object.values(PETS)) {
			expect(pet.price).toBeGreaterThanOrEqual(0);
		}
	});

	it("has valid rarity values", () => {
		const validRarities = new Set(["common", "uncommon", "rare", "legendary"]);
		for (const pet of Object.values(PETS)) {
			expect(validRarities.has(pet.rarity)).toBe(true);
		}
	});
});
