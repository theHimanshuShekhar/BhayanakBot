import { describe, expect, it } from "vitest";
import { ITEMS } from "../../../src/lib/rpg/catalogs/items.js";

describe("items catalog consistency", () => {
	it("has unique item IDs", () => {
		const ids = Object.values(ITEMS).map((i) => i.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("has non-negative prices", () => {
		for (const item of Object.values(ITEMS)) {
			expect(item.price).toBeGreaterThanOrEqual(0);
		}
	});

	it("has dropRate in [0, 1] when present", () => {
		for (const item of Object.values(ITEMS)) {
			if (item.dropRate !== undefined) {
				expect(item.dropRate).toBeGreaterThanOrEqual(0);
				expect(item.dropRate).toBeLessThanOrEqual(1);
			}
		}
	});

	it("has positive effect values when present", () => {
		for (const item of Object.values(ITEMS)) {
			if (item.effect) {
				expect(item.effect.bonusPercent).toBeGreaterThan(0);
				expect(item.effect.durationMs).toBeGreaterThan(0);
			}
		}
	});
});
