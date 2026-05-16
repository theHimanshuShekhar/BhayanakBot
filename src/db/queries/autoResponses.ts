import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { autoResponses } from "../schema.js";

export type AutoResponse = typeof autoResponses.$inferSelect;

export async function addAutoResponse(data: {
	guildId: string;
	trigger: string;
	response: string;
	matchType: "exact" | "contains" | "startsWith";
	responseType?: "static" | "llm";
	useRegex?: boolean;
	channelIds?: string[];
	requireMention?: boolean;
	chancePercent?: number;
	deleteTrigger?: boolean;
}): Promise<AutoResponse> {
	const [created] = await db
		.insert(autoResponses)
		.values({
			...data,
			responseType: data.responseType ?? "static",
			useRegex: data.useRegex ?? false,
			channelIds: data.channelIds ?? [],
			requireMention: data.requireMention ?? false,
			chancePercent: data.chancePercent ?? 100,
			deleteTrigger: data.deleteTrigger ?? false,
		})
		.returning();
	return created;
}

export async function removeAutoResponse(guildId: string, trigger: string): Promise<boolean> {
	const result = await db
		.delete(autoResponses)
		.where(and(eq(autoResponses.guildId, guildId), eq(autoResponses.trigger, trigger)));
	return (result.rowCount ?? 0) > 0;
}

export async function getGuildAutoResponses(guildId: string): Promise<AutoResponse[]> {
	return db.query.autoResponses.findMany({ where: eq(autoResponses.guildId, guildId) });
}

export interface MatchResult {
	response: AutoResponse;
	captured?: Record<string, string>;
}

export async function findMatchingResponse(guildId: string, content: string, channelId: string, botMentioned: boolean): Promise<MatchResult | undefined> {
	const responses = await getGuildAutoResponses(guildId);
	const lower = content.toLowerCase();

	for (const r of responses) {
		// Check channel restriction
		if (r.channelIds.length > 0 && !r.channelIds.includes(channelId)) continue;

		// Check mention requirement
		if (r.requireMention && !botMentioned) continue;

		// Check chance
		if (r.chancePercent < 100 && Math.random() * 100 > r.chancePercent) continue;

		let matched = false;
		let captured: Record<string, string> | undefined;

		if (r.useRegex) {
			try {
				const regex = new RegExp(r.trigger, "i");
				const match = regex.exec(content);
				if (match) {
					matched = true;
					// Extract named capture groups
					if (match.groups) {
						captured = match.groups;
					}
				}
			} catch {
				// Invalid regex, skip
				continue;
			}
		} else {
			const trigger = r.trigger.toLowerCase();
			if (r.matchType === "exact") matched = lower === trigger;
			else if (r.matchType === "startsWith") matched = lower.startsWith(trigger);
			else matched = lower.includes(trigger);
		}

		if (matched) {
			return { response: r, captured };
		}
	}

	return undefined;
}
