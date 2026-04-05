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
