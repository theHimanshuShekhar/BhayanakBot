import { describe, expect, it, vi } from "vitest";
import { calculateLevel, rollDrops } from "../../../src/lib/rpg/helpers/rewards.js";

describe("calculateLevel", () => {
	it("returns 0 for 0 XP", () => {
		expect(calculateLevel(0)).toBe(0);
	});

	it("returns 1 at 400 XP", () => {
		expect(calculateLevel(400)).toBe(1);
	});

	it("returns 2 at 2500 XP", () => {
		expect(calculateLevel(2500)).toBe(2);
	});

	it("returns correct level at boundary", () => {
		// floor(0.05 * sqrt(1600)) = floor(0.05 * 40) = floor(2) = 2
		expect(calculateLevel(1600)).toBe(2);
	});
});

describe("rollDrops", () => {
	it("returns empty array when drop table is empty", () => {
		expect(rollDrops([])).toEqual([]);
	});

	it("drops item when roll is below dropRate", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.03);
		const drops = rollDrops(["old_coin"]);
		expect(drops).toContain("old_coin");
		vi.restoreAllMocks();
	});

	it("does not drop item when roll is above dropRate", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.9);
		const drops = rollDrops(["old_coin"]);
		expect(drops).not.toContain("old_coin");
		vi.restoreAllMocks();
	});

	it("rolls each item independently", () => {
		let callCount = 0;
		vi.spyOn(Math, "random").mockImplementation(() => {
			callCount++;
			return callCount === 1 ? 0.03 : 0.9;
		});
		const drops = rollDrops(["old_coin", "rare_gem"]);
		expect(drops).toEqual(["old_coin"]);
		vi.restoreAllMocks();
	});
});
