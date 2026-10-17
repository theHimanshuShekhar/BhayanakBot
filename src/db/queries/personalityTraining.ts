import { and, asc, eq, gt, isNull, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";
import { db } from "../../lib/database.js";
import {
	archivedChannelMessages,
	guildPersonalityProfiles,
	guildSettings,
	userPersonalityProfiles,
} from "../schema.js";

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

interface GuildTrainingMessageWindowInput {
	guildId: string;
	afterMessageCreatedAt: Date | null;
	/** Optional tiebreaker for rows sharing afterMessageCreatedAt. */
	afterMessageId?: string | null;
	limit: number;
}

/** Evidence a profile needs before it is built (no profile yet) or refreshed (one exists). */
export interface DueProfileThresholds {
	initial: number;
	refresh: number;
}

const trimPattern = String.raw`^\s+|\s+$`;
const trimmedContent = sql<string>`regexp_replace(${archivedChannelMessages.content}, ${trimPattern}, '', 'g')`;
const contentWithoutUrls = sql<string>`regexp_replace(${trimmedContent}, 'https?://[^[:space:]]+', '', 'g')`;
const alphaContent = sql<string>`regexp_replace(${contentWithoutUrls}, '[^A-Za-z]', '', 'g')`;

function baseTrainingEligibilityConditions(afterMessageCreatedAt: Date | null, afterMessageId?: string | null): SQL[] {
	const conditions: SQL[] = [
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

function trainingEligibilityConditions(
	guildId: string,
	afterMessageCreatedAt: Date | null,
	afterMessageId?: string | null,
): SQL[] {
	return [
		eq(archivedChannelMessages.guildId, guildId),
		...baseTrainingEligibilityConditions(afterMessageCreatedAt, afterMessageId),
	];
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

/** Messages after a profile's archive cursor; a profile without a cursor counts every eligible message. */
function afterProfileCursor(cursorAt: AnyPgColumn, cursorId: AnyPgColumn): SQL {
	return sql`(${cursorAt} is null or ${archivedChannelMessages.messageCreatedAt} > ${cursorAt} or (${cursorId} is not null and ${archivedChannelMessages.messageCreatedAt} = ${cursorAt} and ${archivedChannelMessages.messageId} > ${cursorId}))`;
}

/** Guilds whose personality features are on; a guild with no settings row defaults to on. */
const personalityEnabledGuild = or(isNull(guildSettings.guildId), eq(guildSettings.personalityEnabled, true));

/**
 * Members whose profile is due: eligible archive messages after their cursor meet the threshold (initial when
 * they have no profile yet, refresh otherwise). Guilds with personality features off are left out. Most
 * evidence first.
 */
export async function getUsersDueForPersonalityBuild(
	thresholds: DueProfileThresholds,
): Promise<{ userId: string; guildId: string }[]> {
	return db
		.select({
			userId: archivedChannelMessages.authorUserId,
			guildId: archivedChannelMessages.guildId,
		})
		.from(archivedChannelMessages)
		.leftJoin(
			userPersonalityProfiles,
			and(
				eq(userPersonalityProfiles.userId, archivedChannelMessages.authorUserId),
				eq(userPersonalityProfiles.guildId, archivedChannelMessages.guildId),
			),
		)
		.leftJoin(guildSettings, eq(guildSettings.guildId, archivedChannelMessages.guildId))
		.where(
			and(
				...baseTrainingEligibilityConditions(null),
				afterProfileCursor(
					userPersonalityProfiles.lastTrainingMessageAt,
					userPersonalityProfiles.lastTrainingMessageId,
				),
				personalityEnabledGuild,
			),
		)
		.groupBy(archivedChannelMessages.guildId, archivedChannelMessages.authorUserId)
		.having(
			sql`count(*) >= case when bool_or(${userPersonalityProfiles.profile} is not null) then ${thresholds.refresh}::int else ${thresholds.initial}::int end`,
		)
		.orderBy(sql`count(*) desc`, asc(archivedChannelMessages.guildId), asc(archivedChannelMessages.authorUserId));
}

/** Guilds whose server profile is due, by the same rule as `getUsersDueForPersonalityBuild`. */
export async function getGuildsDueForPersonalityBuild(thresholds: DueProfileThresholds): Promise<string[]> {
	const rows = await db
		.select({ guildId: archivedChannelMessages.guildId })
		.from(archivedChannelMessages)
		.leftJoin(guildPersonalityProfiles, eq(guildPersonalityProfiles.guildId, archivedChannelMessages.guildId))
		.leftJoin(guildSettings, eq(guildSettings.guildId, archivedChannelMessages.guildId))
		.where(
			and(
				...baseTrainingEligibilityConditions(null),
				afterProfileCursor(
					guildPersonalityProfiles.lastTrainingMessageAt,
					guildPersonalityProfiles.lastTrainingMessageId,
				),
				personalityEnabledGuild,
			),
		)
		.groupBy(archivedChannelMessages.guildId)
		.having(
			sql`count(*) >= case when bool_or(${guildPersonalityProfiles.profile} is not null) then ${thresholds.refresh}::int else ${thresholds.initial}::int end`,
		)
		.orderBy(sql`count(*) desc`, asc(archivedChannelMessages.guildId));
	return rows.map((row) => row.guildId);
}

export async function getEligibleGuildTrainingMessageWindow(
	input: GuildTrainingMessageWindowInput,
): Promise<TrainingMessage[]> {
	return selectTrainingMessages(
		and(...trainingEligibilityConditions(input.guildId, input.afterMessageCreatedAt, input.afterMessageId)),
		input.limit,
	);
}
