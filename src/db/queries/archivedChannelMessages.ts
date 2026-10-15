import { and, asc, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
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
export type ArchivedMessageUpsertResult = { inserted: boolean; deleted: boolean };

const pendingDeletedMessages = new Map<string, Date>();

export const archivedChannelMessageTestHooks: {
	afterPendingDeleteRead?: () => Promise<void> | void;
} = {};

export async function upsertArchivedChannelMessage(input: ArchivedMessageInput): Promise<ArchivedMessageUpsertResult> {
	const pendingDeletedAt = pendingDeletedMessages.get(input.messageId) ?? null;
	if (process.env.NODE_ENV === "test") await archivedChannelMessageTestHooks.afterPendingDeleteRead?.();
	const insertedRows = await db
		.insert(archivedChannelMessages)
		.values({ ...input, updatedAt: new Date(), deletedAt: pendingDeletedAt })
		.onConflictDoNothing()
		.returning({ messageId: archivedChannelMessages.messageId });

	if (insertedRows.length === 0) {
		await db
			.update(archivedChannelMessages)
			.set({
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
			})
			.where(eq(archivedChannelMessages.messageId, input.messageId));
	}

	const finalPendingDeletedAt = pendingDeletedMessages.get(input.messageId) ?? pendingDeletedAt;
	if (finalPendingDeletedAt) {
		await db
			.update(archivedChannelMessages)
			.set({
				deletedAt: finalPendingDeletedAt,
				updatedAt: finalPendingDeletedAt,
			})
			.where(eq(archivedChannelMessages.messageId, input.messageId));
	}

	pendingDeletedMessages.delete(input.messageId);
	return { inserted: insertedRows.length > 0, deleted: finalPendingDeletedAt !== null };
}

export async function markArchivedChannelMessageEdited(input: ArchivedMessageInput): Promise<void> {
	await upsertArchivedChannelMessage({ ...input, editedAt: input.editedAt ?? new Date() });
}

export async function markArchivedChannelMessagesDeleted(messageIds: string[], deletedAt = new Date()): Promise<void> {
	if (messageIds.length === 0) return;
	const updatedRows = await db
		.update(archivedChannelMessages)
		.set({ deletedAt, updatedAt: deletedAt })
		.where(inArray(archivedChannelMessages.messageId, messageIds))
		.returning({ messageId: archivedChannelMessages.messageId });
	const updatedIds = new Set(updatedRows.map((row) => row.messageId));
	for (const messageId of messageIds) {
		if (!updatedIds.has(messageId)) pendingDeletedMessages.set(messageId, deletedAt);
	}
}

export async function markArchivedChannelMessageDeleted(messageId: string, deletedAt = new Date()): Promise<void> {
	await markArchivedChannelMessagesDeleted([messageId], deletedAt);
}

export async function isArchivedChannelMessageDeleted(messageId: string): Promise<boolean> {
	const row = await db.query.archivedChannelMessages.findFirst({
		columns: { deletedAt: true },
		where: eq(archivedChannelMessages.messageId, messageId),
	});
	return row?.deletedAt != null;
}

/** Each attempt drops one row the JS game rules reject, so a handful is plenty for the SQL/JS rule overlap. */
const MAX_RANDOM_PICK_ATTEMPTS = 5;

export async function getRandomGuessWhoMessage(input: {
	guildId: string;
	channelId: string;
	excludeAuthorUserId: string;
	/** Messages that must not be picked, e.g. ones already found deleted on Discord during this draw. */
	excludeMessageIds?: string[];
	now?: Date;
}): Promise<GuessWhoArchivedMessage | null> {
	const now = input.now ?? new Date();
	const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
	const rejectedMessageIds = [...(input.excludeMessageIds ?? [])];

	for (let attempt = 0; attempt < MAX_RANDOM_PICK_ATTEMPTS; attempt++) {
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
			rejectedMessageIds.length > 0 ? notInArray(archivedChannelMessages.messageId, rejectedMessageIds) : undefined,
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
			.orderBy(asc(archivedChannelMessages.messageCreatedAt), asc(archivedChannelMessages.messageId))
			.limit(1)
			.offset(Math.floor(Math.random() * count));
		if (!candidate) return null;

		if (isGameEligibleContent({ content: candidate.content, messageCreatedAt: candidate.messageCreatedAt }, now)) {
			return candidate;
		}
		rejectedMessageIds.push(candidate.messageId);
	}

	return null;
}
