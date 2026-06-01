import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { polls } from "../schema.js";

export type Poll = typeof polls.$inferSelect;

export interface PollOption {
	label: string;
	votes: string[]; // user IDs
}

export async function createPoll(data: {
	messageId: string;
	channelId: string;
	guildId: string;
	question: string;
	options: PollOption[];
	expiresAt?: Date;
}): Promise<Poll> {
	const [poll] = await db.insert(polls).values(data).returning();
	return poll;
}

export async function getPollByMessage(messageId: string): Promise<Poll | undefined> {
	return db.query.polls.findFirst({ where: eq(polls.messageId, messageId) });
}

export async function vote(messageId: string, optionIndex: number, userId: string): Promise<Poll | undefined> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`poll:${messageId}`}, 0))`);

		const [poll] = await tx.select().from(polls).where(eq(polls.messageId, messageId)).limit(1);
		if (!poll || poll.closed) return undefined;

		const options = poll.options as PollOption[];
		// Remove user's previous vote
		for (const opt of options) {
			opt.votes = opt.votes.filter((v) => v !== userId);
		}
		// Add new vote
		if (options[optionIndex]) {
			options[optionIndex].votes.push(userId);
		}

		const [updated] = await tx.update(polls).set({ options }).where(eq(polls.messageId, messageId)).returning();
		return updated;
	});
}

export async function closePoll(messageId: string): Promise<void> {
	await db.update(polls).set({ closed: true }).where(eq(polls.messageId, messageId));
}

export async function getActiveExpiredPolls(): Promise<Poll[]> {
	return db.query.polls.findMany({
		where: and(eq(polls.closed, false), lte(polls.expiresAt, new Date())),
	});
}
