import { and, asc, eq, gt, isNull, type SQL, sql } from "drizzle-orm";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";
import { db } from "../../lib/database.js";
import { archivedChannelMessages } from "../schema.js";

export interface TrainingMessage {
	messageId: string;
	authorUserId: string;
	content: string;
	messageCreatedAt: Date;
}

interface UserTrainingMessagesInput {
	guildId: string;
	userId: string;
	afterMessageCreatedAt: Date | null;
	/** Optional tiebreaker for rows sharing afterMessageCreatedAt. */
	afterMessageId?: string | null;
	limit: number;
}

interface GuildTrainingMessagesInput {
	guildId: string;
	afterMessageCreatedAt: Date | null;
	/** Optional tiebreaker for rows sharing afterMessageCreatedAt. */
	afterMessageId?: string | null;
	limit: number;
	maxPerAuthor: number;
}

interface GuildTrainingMessageWindowInput {
	guildId: string;
	afterMessageCreatedAt: Date | null;
	/** Optional tiebreaker for rows sharing afterMessageCreatedAt. */
	afterMessageId?: string | null;
	limit: number;
}

const trimPattern = String.raw`^\s+|\s+$`;
const trimmedContent = sql<string>`regexp_replace(${archivedChannelMessages.content}, ${trimPattern}, '', 'g')`;
const contentWithoutUrls = sql<string>`regexp_replace(${trimmedContent}, 'https?://[^[:space:]]+', '', 'g')`;
const alphaContent = sql<string>`regexp_replace(${contentWithoutUrls}, '[^A-Za-z]', '', 'g')`;

function trainingEligibilityConditions(
	guildId: string,
	afterMessageCreatedAt: Date | null,
	afterMessageId?: string | null,
): SQL[] {
	const conditions: SQL[] = [
		eq(archivedChannelMessages.guildId, guildId),
		eq(archivedChannelMessages.channelId, GUESS_WHO_CHANNEL_ID),
		isNull(archivedChannelMessages.deletedAt),
		sql`length(${trimmedContent}) between 15 and 1000`,
		sql`length(${contentWithoutUrls}) >= 10`,
		sql`length(${alphaContent}) >= 5`,
		sql`${trimmedContent} not like '/%'`,
		sql`${trimmedContent} not like '!%'`,
		sql`${trimmedContent} !~* '^https?://[^[:space:]]+$'`,
		sql`${trimmedContent} not like '%@everyone%'`,
		sql`${trimmedContent} not like '%@here%'`,
		sql`${trimmedContent} !~ '(<@!?[0-9]+>.*){5}'`,
	];

	if (afterMessageCreatedAt) {
		conditions.push(
			afterMessageId
				? sql`(${gt(archivedChannelMessages.messageCreatedAt, afterMessageCreatedAt)} or (${eq(archivedChannelMessages.messageCreatedAt, afterMessageCreatedAt)} and ${gt(archivedChannelMessages.messageId, afterMessageId)}))`
				: gt(archivedChannelMessages.messageCreatedAt, afterMessageCreatedAt),
		);
	}

	return conditions;
}

function selectTrainingMessages(where: SQL | undefined, limit: number): Promise<TrainingMessage[]> {
	return db
		.select({
			messageId: archivedChannelMessages.messageId,
			authorUserId: archivedChannelMessages.authorUserId,
			content: archivedChannelMessages.content,
			messageCreatedAt: archivedChannelMessages.messageCreatedAt,
		})
		.from(archivedChannelMessages)
		.where(where)
		.orderBy(asc(archivedChannelMessages.messageCreatedAt), asc(archivedChannelMessages.messageId))
		.limit(limit);
}

export async function getEligibleUserTrainingMessages(input: UserTrainingMessagesInput): Promise<TrainingMessage[]> {
	return selectTrainingMessages(
		and(
			...trainingEligibilityConditions(input.guildId, input.afterMessageCreatedAt, input.afterMessageId),
			eq(archivedChannelMessages.authorUserId, input.userId),
		),
		input.limit,
	);
}

export async function getEligibleGuildTrainingMessageWindow(
	input: GuildTrainingMessageWindowInput,
): Promise<TrainingMessage[]> {
	return selectTrainingMessages(
		and(...trainingEligibilityConditions(input.guildId, input.afterMessageCreatedAt, input.afterMessageId)),
		input.limit,
	);
}

export async function getEligibleGuildTrainingMessages(input: GuildTrainingMessagesInput): Promise<TrainingMessage[]> {
	const rankedMessages = db
		.select({
			messageId: archivedChannelMessages.messageId,
			authorUserId: archivedChannelMessages.authorUserId,
			content: archivedChannelMessages.content,
			messageCreatedAt: archivedChannelMessages.messageCreatedAt,
			authorRank:
				sql<number>`row_number() over (partition by ${archivedChannelMessages.authorUserId} order by ${archivedChannelMessages.messageCreatedAt}, ${archivedChannelMessages.messageId})`.as(
					"author_rank",
				),
		})
		.from(archivedChannelMessages)
		.where(and(...trainingEligibilityConditions(input.guildId, input.afterMessageCreatedAt, input.afterMessageId)))
		.as("ranked_training_messages");

	return db
		.select({
			messageId: rankedMessages.messageId,
			authorUserId: rankedMessages.authorUserId,
			content: rankedMessages.content,
			messageCreatedAt: rankedMessages.messageCreatedAt,
		})
		.from(rankedMessages)
		.where(sql`${rankedMessages.authorRank} <= ${input.maxPerAuthor}`)
		.orderBy(asc(rankedMessages.messageCreatedAt), asc(rankedMessages.messageId))
		.limit(input.limit);
}
