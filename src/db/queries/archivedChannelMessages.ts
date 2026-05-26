import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { isGameEligibleContent } from "../../lib/guessWho/eligibility.js";
import { archivedChannelMessages } from "../schema.js";

export type ArchivedMessageInput = {
	messageId: string;
	guildId: string;
	channelId: string;
	authorUserId: string;
	authorUsername: string;
	authorDisplayName: string;
	content: string;
	messageCreatedAt: Date;
	editedAt?: Date | null;
};

export type GuessWhoArchivedMessage = typeof archivedChannelMessages.$inferSelect;

const pendingDeletedMessages = new Map<string, Date>();

export async function upsertArchivedChannelMessage(input: ArchivedMessageInput): Promise<void> {
	const pendingDeletedAt = pendingDeletedMessages.get(input.messageId) ?? null;
	await db
		.insert(archivedChannelMessages)
		.values({ ...input, updatedAt: new Date(), deletedAt: pendingDeletedAt })
		.onConflictDoUpdate({
			target: archivedChannelMessages.messageId,
			set: {
				guildId: input.guildId,
				channelId: input.channelId,
				authorUserId: input.authorUserId,
				authorUsername: input.authorUsername,
				authorDisplayName: input.authorDisplayName,
				content: input.content,
				messageCreatedAt: input.messageCreatedAt,
				editedAt: input.editedAt ?? null,
				updatedAt: new Date(),
				deletedAt: sql`coalesce(${archivedChannelMessages.deletedAt}, ${pendingDeletedAt})`,
			},
		});
	pendingDeletedMessages.delete(input.messageId);
}

export async function markArchivedChannelMessageEdited(input: ArchivedMessageInput): Promise<void> {
	await upsertArchivedChannelMessage({ ...input, editedAt: input.editedAt ?? new Date() });
}

export async function markArchivedChannelMessageDeleted(messageId: string, deletedAt = new Date()): Promise<void> {
	const updatedRows = await db
		.update(archivedChannelMessages)
		.set({ deletedAt, updatedAt: deletedAt })
		.where(eq(archivedChannelMessages.messageId, messageId))
		.returning({ messageId: archivedChannelMessages.messageId });
	if (updatedRows.length === 0) pendingDeletedMessages.set(messageId, deletedAt);
}

export async function getRandomGuessWhoMessage(input: {
	guildId: string;
	channelId: string;
	excludeAuthorUserId: string;
	now?: Date;
}): Promise<GuessWhoArchivedMessage | null> {
	const now = input.now ?? new Date();
	const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
	const eligibleWhere = and(
		eq(archivedChannelMessages.guildId, input.guildId),
		eq(archivedChannelMessages.channelId, input.channelId),
		ne(archivedChannelMessages.authorUserId, input.excludeAuthorUserId),
		isNull(archivedChannelMessages.deletedAt),
		lt(archivedChannelMessages.messageCreatedAt, cutoff),
		sql`length(regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g')) between 15 and 300`,
		sql`regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g') not like '/%'`,
		sql`regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g') not like '!%'`,
		sql`regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g') !~* '^https?://\\S+$'`,
		sql`regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g') not like '%@everyone%'`,
		sql`regexp_replace(${archivedChannelMessages.content}, '^\\s+|\\s+$', '', 'g') not like '%@here%'`,
	);

	const [countRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(archivedChannelMessages)
		.where(eligibleWhere);
	const count = countRow?.count ?? 0;
	if (count === 0) return null;

	const [candidate] = await db
		.select()
		.from(archivedChannelMessages)
		.where(eligibleWhere)
		.limit(1)
		.offset(Math.floor(Math.random() * count));
	if (!candidate) return null;

	return isGameEligibleContent({ content: candidate.content, messageCreatedAt: candidate.messageCreatedAt }, now)
		? candidate
		: null;
}
