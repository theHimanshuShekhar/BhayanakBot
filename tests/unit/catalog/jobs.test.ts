import { describe, expect, it } from "vitest";
import { JOBS } from "../../../src/lib/rpg/catalogs/jobs.js";
import { ITEMS } from "../../../src/lib/rpg/catalogs/items.js";

describe("jobs catalog consistency", () => {
	it("has unique job IDs", () => {
		const ids = Object.values(JOBS).map((j) => j.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("references only existing items in dropTable", () => {
		for (const job of Object.values(JOBS)) {
			for (const itemId of job.dropTable) {
				expect(ITEMS[itemId]).toBeDefined();
			}
		}
	});

	it("references only tool items in toolBypass", () => {
		for (const job of Object.values(JOBS)) {
			if (job.toolBypass) {
				const item = ITEMS[job.toolBypass];
				expect(item).toBeDefined();
				expect(item.slot).toBe("tool");
			}
		}
	});

	it("has jailSentenceMs for all crime jobs", () => {
		for (const job of Object.values(JOBS)) {
			if (job.category === "crime") {
				expect(job.jailSentenceMs).toBeGreaterThan(0);
			}
		}
	});

	it("has baseSuccessChance in [0, 1]", () => {
		for (const job of Object.values(JOBS)) {
			expect(job.baseSuccessChance).toBeGreaterThanOrEqual(0);
			expect(job.baseSuccessChance).toBeLessThanOrEqual(1);
		}
	});

	it("has valid payRange", () => {
		for (const job of Object.values(JOBS)) {
			expect(job.payRange[0]).toBeGreaterThanOrEqual(0);
			expect(job.payRange[1]).toBeGreaterThanOrEqual(job.payRange[0]);
		}
	});

	it("has positive cooldownMs", () => {
		for (const job of Object.values(JOBS)) {
			expect(job.cooldownMs).toBeGreaterThan(0);
		}
	});
});
