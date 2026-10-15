import { and, eq, lte, sql } from "drizzle-orm";
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

// Generic Feature: another guild's message ID is indistinguishable from one that does not exist.
export async function getGiveawayByMessage(guildId: string, messageId: string): Promise<Giveaway | undefined> {
	return db.query.giveaways.findFirst({
		where: and(eq(giveaways.guildId, guildId), eq(giveaways.messageId, messageId)),
	});
}

export async function addEntry(guildId: string, messageId: string, userId: string): Promise<Giveaway | undefined> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`giveaway:${messageId}`}, 0))`);

		const where = and(eq(giveaways.guildId, guildId), eq(giveaways.messageId, messageId));
		const [giveaway] = await tx.select().from(giveaways).where(where).limit(1);
		if (!giveaway || giveaway.ended) return undefined;

		const entries = [...new Set([...giveaway.entries, userId])];
		const [updated] = await tx.update(giveaways).set({ entries }).where(where).returning();
		return updated;
	});
}

/**
 * Ends a giveaway if, and only if, it has not ended yet. Returns the ended giveaway to exactly one caller;
 * every other caller (the expiry task racing a moderator, another guild's ID) gets undefined and must not announce.
 */
export async function endGiveaway(
	guildId: string,
	messageId: string,
	winners: string[],
): Promise<Giveaway | undefined> {
	const [ended] = await db
		.update(giveaways)
		.set({ ended: true, winners })
		.where(and(eq(giveaways.guildId, guildId), eq(giveaways.messageId, messageId), eq(giveaways.ended, false)))
		.returning();
	return ended;
}

/**
 * Records a reroll. `giveaway.winners` accumulates everyone who ever won, so the next reroll can exclude them all.
 * The update only applies if the winners are still the ones the draw excluded; otherwise a concurrent reroll got
 * there first and undefined is returned.
 */
export async function rerollGiveaway(
	guildId: string,
	messageId: string,
	previousWinners: string[],
	newWinners: string[],
): Promise<Giveaway | undefined> {
	const [updated] = await db
		.update(giveaways)
		.set({ winners: [...previousWinners, ...newWinners] })
		.where(
			and(
				eq(giveaways.guildId, guildId),
				eq(giveaways.messageId, messageId),
				eq(giveaways.ended, true),
				sql`${giveaways.winners} = ${JSON.stringify(previousWinners)}::jsonb`,
			),
		)
		.returning();
	return updated;
}

export async function getActiveExpiredGiveaways(): Promise<Giveaway[]> {
	return db.query.giveaways.findMany({
		where: and(eq(giveaways.ended, false), lte(giveaways.endsAt, new Date())),
	});
}
