import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { callOllama } from "../lib/ollama.js";
import { getAllActiveGuildIds } from "../db/queries/guildSettings.js";
import { getTodayQuests, insertDailyQuests } from "../db/queries/rpg.js";
import { QUEST_TEMPLATES, type QuestTemplate } from "../lib/rpg/catalogs/questTemplates.js";

const VALID_OBJECTIVE_TYPES = new Set(["work", "crime", "train"]);
const VALID_JOBS = new Set([
	"fishing",
	"construction",
	"delivery_driver",
	"mining",
	"programmer",
	"lawyer",
	"doctor",
	"pickpocket",
	"rob_player",
	"rob_bank",
]);

function pickFallbackQuests(date: string, guildId: string): QuestTemplate[] {
	const shuffled = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, 3);
}

function isValidQuestArray(data: unknown): data is QuestTemplate[] {
	if (!Array.isArray(data) || data.length === 0) return false;
	return data.every(
		(q) =>
			typeof q.title === "string" &&
			typeof q.description === "string" &&
			VALID_OBJECTIVE_TYPES.has(q.objectiveType) &&
			(q.objectiveJob === null || VALID_JOBS.has(q.objectiveJob)) &&
			typeof q.objectiveCount === "number" &&
			q.objectiveCount >= 1 &&
			q.objectiveCount <= 10 &&
			typeof q.rewardCoins === "number" &&
			typeof q.rewardXp === "number",
	);
}

async function generateQuestsWithOllama(guildId: string, date: string): Promise<QuestTemplate[]> {
	const system = "You are a quest designer for a Discord RPG bot. Respond ONLY with valid JSON array, no explanation, no markdown.";
	const prompt = `Generate 3 daily quests as a JSON array. Each quest object must have exactly these fields:
- title: string (max 60 chars, witty)
- description: string (max 120 chars, witty tone)
- objectiveType: one of "work", "crime", or "train"
- objectiveJob: one of ["fishing","construction","delivery_driver","mining","programmer","lawyer","doctor","pickpocket","rob_player","rob_bank"] or null for any job
- objectiveCount: integer 1-5
- rewardCoins: integer 200-1000
- rewardXp: integer 50-300

Make the 3 quests varied — different objectiveTypes if possible. Respond with ONLY the JSON array.`;

	const raw = await callOllama(system, prompt, 30_000);
	if (!raw) return pickFallbackQuests(date, guildId);

	try {
		// Strip markdown code fences if present
		const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
		const parsed: unknown = JSON.parse(cleaned);
		if (isValidQuestArray(parsed)) return parsed.slice(0, 3);
	} catch {
		// fall through to fallback
	}

	return pickFallbackQuests(date, guildId);
}

export class GenerateDailyQuestsTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "generateDailyQuests" });
	}

	public async run(): Promise<void> {
		const today = new Date().toISOString().slice(0, 10);
		let guildIds: string[];
		try {
			guildIds = await getAllActiveGuildIds();
		} catch (err) {
			this.container.logger.error("[GenerateDailyQuests] Failed to fetch guild IDs:", err);
			return;
		}

		for (const guildId of guildIds) {
			try {
				const existing = await getTodayQuests(guildId, today);
				if (existing.length >= 3) continue;

				const templates = await generateQuestsWithOllama(guildId, today);
				await insertDailyQuests(
					templates.map((t) => ({
						guildId,
						date: today,
						title: t.title,
						description: t.description,
						objectiveType: t.objectiveType,
						objectiveJob: t.objectiveJob ?? null,
						objectiveCount: t.objectiveCount,
						rewardCoins: t.rewardCoins,
						rewardXp: t.rewardXp,
					})),
				);
				this.container.logger.info(`[GenerateDailyQuests] Generated quests for guild ${guildId} on ${today}`);
			} catch (err) {
				this.container.logger.error(`[GenerateDailyQuests] Failed for guild ${guildId}:`, err);
			}
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		generateDailyQuests: never;
	}
}
