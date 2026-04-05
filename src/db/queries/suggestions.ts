import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { suggestions } from "../schema.js";

export type Suggestion = typeof suggestions.$inferSelect;

export async function createSuggestion(data: { messageId: string; channelId: string; userId: string; guildId: string; content: string }): Promise<Suggestion> {
	const [suggestion] = await db.insert(suggestions).values(data).returning();
	return suggestion;
}

export async function getSuggestion(id: number, guildId: string): Promise<Suggestion | undefined> {
	return db.query.suggestions.findFirst({ where: and(eq(suggestions.id, id), eq(suggestions.guildId, guildId)) });
}

export async function updateSuggestionStatus(id: number, status: "approved" | "denied", response?: string): Promise<void> {
	await db.update(suggestions).set({ status, response }).where(eq(suggestions.id, id));
}
