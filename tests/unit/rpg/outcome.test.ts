import { describe, expect, it, vi } from "vitest";
import { rollOutcome, randomPay } from "../../../src/lib/rpg/helpers/outcome.js";

describe("rollOutcome", () => {
	it("calculates stat bonus correctly", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: ["strength"],
			stats: { strength: 80, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		// base 0.5 + (80 - 50) * 0.003 = 0.5 + 0.09 = 0.59
		expect(result.finalChance).toBe(0.59);
	});

	it("applies tool bypass penalty", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
			toolBypass: true,
		});
		// 0.5 * 0.6 = 0.3
		expect(result.finalChance).toBe(0.3);
	});

	it("applies consumable bonus", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
			consumableBonus: 0.1,
		});
		expect(result.finalChance).toBe(0.6);
	});

	it("enforces minimum cap of 5%", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.01,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		expect(result.finalChance).toBe(0.05);
	});

	it("enforces maximum cap of 70%", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.9,
			relevantStats: ["strength", "intelligence", "agility", "charisma"],
			stats: { strength: 100, intelligence: 100, agility: 100, charisma: 100, luck: 50 },
			consumableBonus: 0.2,
		});
		expect(result.finalChance).toBe(0.7);
	});

	it("returns success when Math.random is below finalChance", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.3);
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		expect(result.success).toBe(true);
		vi.restoreAllMocks();
	});

	it("returns failure when Math.random is above finalChance", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.6);
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		expect(result.success).toBe(false);
		vi.restoreAllMocks();
	});
});

describe("randomPay", () => {
	it("returns a value within the inclusive range", () => {
		for (let i = 0; i < 100; i++) {
			const pay = randomPay(50, 200);
			expect(pay).toBeGreaterThanOrEqual(50);
			expect(pay).toBeLessThanOrEqual(200);
		}
	});

	it("returns exact value when min equals max", () => {
		expect(randomPay(100, 100)).toBe(100);
	});
});
