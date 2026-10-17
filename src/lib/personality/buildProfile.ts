import { and, eq } from "drizzle-orm";
import { getEligibleUserTrainingMessages } from "../../db/queries/personalityTraining.js";
import { userPersonalityProfiles } from "../../db/schema.js";
import { db } from "../database.js";
import {
	buildProfile,
	type PersonalityBuildResult,
	PROFILE_SIZE_INSTRUCTION,
	type ProfileKind,
} from "./profileBuilder.js";
import { MAX_PROFILE_CHARS } from "./profileSize.js";
import { SOURCE_DATA_NOTICE } from "./sourcePrompt.js";

// Prevent runaway prompts: absorb at most 100 messages or 8 000 chars per build pass.
const MAX_MESSAGES_PER_BUILD = 100;
const MAX_CHARS_PER_BUILD = 8_000;
export const INITIAL_USER_PROFILE_THRESHOLD = 100;
export const REFRESH_USER_PROFILE_THRESHOLD = 20;

const SYSTEM_PROMPT = [
	"You are a personality analyst writing a compact profile of a person based solely on their Discord messages.",
	"Cover the dimensions that stand out most: communication style (how they write, vocabulary, slang, emojis), humor, recurring topics and interests, social dynamics (how they treat others and handle disagreement), emotional tone, and notable quirks or recurring expressions.",
	`The whole profile is at most ${MAX_PROFILE_CHARS.toLocaleString("en-US")} characters of flowing prose, not bullet points. Choose the most distinctive observations; do not try to cover everything.`,
	"Do not be generic. Ground every observation in evidence from the messages.",
	"Do not quote source messages directly.",
	SOURCE_DATA_NOTICE,
].join(" ");

function userProfileKind(userId: string, guildId: string): ProfileKind {
	const rowKey = and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, guildId));
	return {
		kind: "user",
		lockKey: `${userId}:${guildId}`,
		subject: `userId=${userId} guildId=${guildId}`,
		session: `profile:user:${guildId}:${userId}`,
		initialThreshold: INITIAL_USER_PROFILE_THRESHOLD,
		refreshThreshold: REFRESH_USER_PROFILE_THRESHOLD,
		systemPrompt: SYSTEM_PROMPT,
		initialHeading: "Messages from this person:",
		initialInstruction: `Write the personality profile for this person. ${PROFILE_SIZE_INSTRUCTION}`,
		existingHeading: "Current personality profile:",
		newMessagesHeading: "New messages from this person since the last profile update:",
		async loadState() {
			const row = await db.query.userPersonalityProfiles.findFirst({
				where: rowKey,
				columns: { profile: true, lastRefreshedAt: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
			});
			return {
				profile: row?.profile ?? null,
				lastRefreshedAt: row?.lastRefreshedAt ?? null,
				cursorAt: row?.lastTrainingMessageAt ?? null,
				cursorId: row?.lastTrainingMessageId ?? null,
			};
		},
		fetchMessages(state) {
			return getEligibleUserTrainingMessages({
				guildId,
				userId,
				afterMessageCreatedAt: state.cursorAt,
				afterMessageId: state.cursorId,
				limit: MAX_MESSAGES_PER_BUILD,
			});
		},
		selectSource(messages) {
			// Chronological, stopping at the size cap; the cursor moves past exactly the messages shown.
			let block = "";
			const absorbed: typeof messages = [];
			for (const m of messages) {
				if (block.length + m.content.length > MAX_CHARS_PER_BUILD) break;
				block += (block ? "\n" : "") + m.content;
				absorbed.push(m);
			}
			return absorbed.length === 0 ? null : { block, sources: absorbed.map((m) => m.content), absorbed };
		},
		async touchLastRefreshed(refreshedAt) {
			await db
				.insert(userPersonalityProfiles)
				.values({ userId, guildId, lastRefreshedAt: refreshedAt })
				.onConflictDoUpdate({
					target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
					set: { lastRefreshedAt: refreshedAt },
				});
		},
		async save(profile, refreshedAt, cursor) {
			const cursorFields = {
				lastRefreshedAt: refreshedAt,
				lastTrainingMessageAt: cursor.messageCreatedAt,
				lastTrainingMessageId: cursor.messageId,
			};
			await db
				.insert(userPersonalityProfiles)
				.values({ userId, guildId, profile, ...cursorFields })
				.onConflictDoUpdate({
					target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
					set: { profile, ...cursorFields },
				});
		},
	};
}

export type { PersonalityBuildResult };

export function buildPersonalityProfile(userId: string, guildId: string): Promise<PersonalityBuildResult> {
	return buildProfile(userProfileKind(userId, guildId));
}
