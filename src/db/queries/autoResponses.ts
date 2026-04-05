import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { autoResponses } from "../schema.js";

export type AutoResponse = typeof autoResponses.$inferSelect;

export async function addAutoResponse(data: {
	guildId: string;
	trigger: string;
	response: string;
	matchType: "exact" | "contains" | "startsWith";
}): Promise<AutoResponse> {
	const [created] = await db.insert(autoResponses).values(data).returning();
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

export async function findMatchingResponse(guildId: string, content: string): Promise<AutoResponse | undefined> {
	const responses = await getGuildAutoResponses(guildId);
	const lower = content.toLowerCase();
	return responses.find((r) => {
		const trigger = r.trigger.toLowerCase();
		if (r.matchType === "exact") return lower === trigger;
		if (r.matchType === "startsWith") return lower.startsWith(trigger);
		return lower.includes(trigger); // contains
	});
}
