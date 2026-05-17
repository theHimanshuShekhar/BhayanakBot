import { describe, expect, it } from "vitest";
import { PROPERTIES } from "../../../src/lib/rpg/catalogs/properties.js";

describe("properties catalog consistency", () => {
	it("has unique property IDs", () => {
		const ids = Object.values(PROPERTIES).map((p) => p.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("has positive prices", () => {
		for (const property of Object.values(PROPERTIES)) {
			expect(property.price).toBeGreaterThan(0);
		}
	});

	it("has non-negative incomePerHour", () => {
		for (const property of Object.values(PROPERTIES)) {
			expect(property.incomePerHour).toBeGreaterThanOrEqual(0);
		}
	});

	it("has non-negative storageBonus", () => {
		for (const property of Object.values(PROPERTIES)) {
			expect(property.storageBonus).toBeGreaterThanOrEqual(0);
		}
	});
});
