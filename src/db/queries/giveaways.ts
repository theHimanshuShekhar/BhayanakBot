import { and, eq, lte } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { giveaways } from "../schema.js";

export type Giveaway = typeof giveaways.$inferSelect;

export async function createGiveaway(data: {
	messageId: string;
	channelId: string;
	guildId: string;
	prize: string;
	winnerCount: number;
	endsAt: Date;
	hostId: string;
}): Promise<Giveaway> {
	const [giveaway] = await db.insert(giveaways).values(data).returning();
	return giveaway;
}

export async function getGiveawayByMessage(messageId: string): Promise<Giveaway | undefined> {
	return db.query.giveaways.findFirst({ where: eq(giveaways.messageId, messageId) });
}

export async function addEntry(messageId: string, userId: string): Promise<Giveaway | undefined> {
	const giveaway = await getGiveawayByMessage(messageId);
	if (!giveaway || giveaway.ended) return undefined;
	const entries = [...new Set([...giveaway.entries, userId])];
	const [updated] = await db.update(giveaways).set({ entries }).where(eq(giveaways.messageId, messageId)).returning();
	return updated;
}

export async function endGiveaway(messageId: string, winners: string[]): Promise<void> {
	await db.update(giveaways).set({ ended: true, winners }).where(eq(giveaways.messageId, messageId));
}

export async function getActiveExpiredGiveaways(): Promise<Giveaway[]> {
	return db.query.giveaways.findMany({
		where: and(eq(giveaways.ended, false), lte(giveaways.endsAt, new Date())),
	});
}
