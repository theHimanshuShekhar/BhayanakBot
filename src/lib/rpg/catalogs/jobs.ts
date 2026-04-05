import type { StatKey } from "../../../db/queries/rpg.js";

export type JobCategory = "fishing" | "blue_collar" | "white_collar" | "crime";

export type Job = {
	id: string;
	name: string;
	category: JobCategory;
	description: string;
	statRequirements: Partial<Record<StatKey, number>>;
	/** itemId: can attempt without stat gate but base success halved */
	toolBypass?: string;
	/** 0–1: base success chance before stat influence */
	baseSuccessChance: number;
	payRange: [number, number];
	cooldownMs: number;
	xpReward: number;
	dropTable: string[]; // itemIds eligible to drop
	/** crime jobs only — jail sentence on failure */
	jailSentenceMs?: number;
};

export const JOBS: Record<string, Job> = {
	fishing: {
		id: "fishing",
		name: "Fishing",
		category: "fishing",
		description: "Cast a line and hope for the best.",
		statRequirements: {},
		toolBypass: "fishing_rod",
		baseSuccessChance: 0.75,
		payRange: [50, 200],
		cooldownMs: 5 * 60 * 1000,
		xpReward: 10,
		dropTable: ["old_coin"],
	},
	construction: {
		id: "construction",
		name: "Construction",
		category: "blue_collar",
		description: "Hard manual labour. Requires a strong back.",
		statRequirements: { strength: 30 },
		baseSuccessChance: 0.7,
		payRange: [150, 400],
		cooldownMs: 15 * 60 * 1000,
		xpReward: 20,
		dropTable: [],
	},
	delivery: {
		id: "delivery",
		name: "Delivery Driver",
		category: "blue_collar",
		description: "Fast hands and faster feet.",
		statRequirements: { agility: 20 },
		baseSuccessChance: 0.72,
		payRange: [100, 300],
		cooldownMs: 10 * 60 * 1000,
		xpReward: 15,
		dropTable: [],
	},
	mining: {
		id: "mining",
		name: "Mining",
		category: "blue_collar",
		description: "Dig deep, find treasure. Dangerous without proper tools.",
		statRequirements: { strength: 50 },
		toolBypass: "pickaxe",
		baseSuccessChance: 0.65,
		payRange: [200, 600],
		cooldownMs: 30 * 60 * 1000,
		xpReward: 35,
		dropTable: ["rare_gem"],
	},
	programmer: {
		id: "programmer",
		name: "Programmer",
		category: "white_collar",
		description: "Ship code. Get paid. Sleep at your desk.",
		statRequirements: { intelligence: 60 },
		baseSuccessChance: 0.68,
		payRange: [500, 1200],
		cooldownMs: 60 * 60 * 1000,
		xpReward: 60,
		dropTable: [],
	},
	lawyer: {
		id: "lawyer",
		name: "Lawyer",
		category: "white_collar",
		description: "Argue with authority. Win with words.",
		statRequirements: { intelligence: 70, charisma: 50 },
		baseSuccessChance: 0.62,
		payRange: [800, 2000],
		cooldownMs: 2 * 60 * 60 * 1000,
		xpReward: 80,
		dropTable: [],
	},
	doctor: {
		id: "doctor",
		name: "Doctor",
		category: "white_collar",
		description: "Heal people. Charge them anyway.",
		statRequirements: { intelligence: 80 },
		baseSuccessChance: 0.6,
		payRange: [1000, 2500],
		cooldownMs: 2 * 60 * 60 * 1000,
		xpReward: 100,
		dropTable: [],
	},
	pickpocket: {
		id: "pickpocket",
		name: "Pickpocket",
		category: "crime",
		description: "Nimble fingers, empty wallets.",
		statRequirements: {},
		baseSuccessChance: 0.55,
		payRange: [20, 100],
		cooldownMs: 10 * 60 * 1000,
		xpReward: 8,
		dropTable: [],
		jailSentenceMs: 5 * 60 * 1000,
	},
	rob_player: {
		id: "rob_player",
		name: "Rob Player",
		category: "crime",
		description: "Bold move. Steal directly from another player.",
		statRequirements: { agility: 30 },
		baseSuccessChance: 0.45,
		payRange: [100, 500],
		cooldownMs: 30 * 60 * 1000,
		xpReward: 25,
		dropTable: [],
		jailSentenceMs: 20 * 60 * 1000,
	},
	rob_bank: {
		id: "rob_bank",
		name: "Rob Bank",
		category: "crime",
		description: "The big score. High risk, legendary reward.",
		statRequirements: { intelligence: 60, agility: 50 },
		baseSuccessChance: 0.3,
		payRange: [2000, 8000],
		cooldownMs: 6 * 60 * 60 * 1000,
		xpReward: 200,
		dropTable: [],
		jailSentenceMs: 2 * 60 * 60 * 1000,
	},
};

export function getJob(id: string): Job | undefined {
	return JOBS[id];
}

export function getJobsByCategory(category: JobCategory): Job[] {
	return Object.values(JOBS).filter((j) => j.category === category);
}
