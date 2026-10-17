import { eq } from "drizzle-orm";
import { getEligibleGuildTrainingMessageWindow, type TrainingMessage } from "../../db/queries/personalityTraining.js";
import { guildPersonalityProfiles } from "../../db/schema.js";
import { db } from "../database.js";
import {
	buildProfile,
	type PersonalityBuildResult,
	PROFILE_SIZE_INSTRUCTION,
	type ProfileKind,
} from "./profileBuilder.js";
import { MAX_PROFILE_CHARS } from "./profileSize.js";
import { SOURCE_DATA_NOTICE } from "./sourcePrompt.js";

const MAX_MESSAGES_PER_BUILD = 200;
const MAX_MESSAGES_PER_AUTHOR = 10;
const MAX_CHARS_PER_BUILD = 8_000;
export const INITIAL_GUILD_PROFILE_THRESHOLD = 200;
export const REFRESH_GUILD_PROFILE_THRESHOLD = 40;

const SYSTEM_PROMPT = [
	"You are a cultural anthropologist writing a compact profile of the personality, culture, and vibe of a Discord server based on its messages.",
	"Cover the dimensions that stand out most: overall tone, humor style and inside jokes, shared interests, social dynamics, notable phrases and slang, how conflict is handled, and what makes this server distinct.",
	`The whole profile is at most ${MAX_PROFILE_CHARS.toLocaleString("en-US")} characters of flowing prose, not bullet points. Choose the most distinctive observations; do not try to cover everything.`,
	"Do not be generic. Ground every observation in evidence from the messages.",
	"Do not quote source messages directly.",
	"Each message line starts with an anonymized author label.",
	SOURCE_DATA_NOTICE,
].join(" ");

function guildProfileKind(guildId: string): ProfileKind {
	return {
		kind: "guild",
		lockKey: guildId,
		subject: `guildId=${guildId}`,
		session: `profile:guild:${guildId}`,
		initialThreshold: INITIAL_GUILD_PROFILE_THRESHOLD,
		refreshThreshold: REFRESH_GUILD_PROFILE_THRESHOLD,
		systemPrompt: SYSTEM_PROMPT,
		initialHeading: "Messages from this Discord server:",
		initialInstruction: `Write the culture profile of this server. ${PROFILE_SIZE_INSTRUCTION}`,
		existingHeading: "Current server culture profile:",
		newMessagesHeading: "New messages from this server since the last profile update:",
		async loadState() {
			const row = await db.query.guildPersonalityProfiles.findFirst({
				where: eq(guildPersonalityProfiles.guildId, guildId),
				columns: { profile: true, lastRefreshedAt: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
			});
			return {
				profile: row?.profile ?? null,
				lastRefreshedAt: row?.lastRefreshedAt ?? null,
				cursorAt: row?.lastTrainingMessageAt ?? null,
				cursorId: row?.lastTrainingMessageId ?? null,
			};
		},
		fetchMessages(state, threshold) {
			return getEligibleGuildTrainingMessageWindow({
				guildId,
				afterMessageCreatedAt: state.cursorAt,
				afterMessageId: state.cursorId,
				limit: threshold,
			});
		},
		selectSource(messages) {
			// The prompt shows a balanced, anonymised sample, but the cursor moves past the whole fetched window.
			const sampled = selectBalancedGuildPromptMessages(messages);
			const authorLabels = buildAuthorLabels(messages);
			let block = "";
			const sources: string[] = [];
			for (const m of sampled) {
				const line = `${authorLabels.get(m.authorUserId)}: ${m.content}`;
				if (block.length + line.length > MAX_CHARS_PER_BUILD) break;
				block += (block ? "\n" : "") + line;
				sources.push(m.content);
			}
			return block.length === 0 ? null : { block, sources, absorbed: messages };
		},
		async touchLastRefreshed(refreshedAt) {
			await db
				.insert(guildPersonalityProfiles)
				.values({ guildId, lastRefreshedAt: refreshedAt })
				.onConflictDoUpdate({ target: guildPersonalityProfiles.guildId, set: { lastRefreshedAt: refreshedAt } });
		},
		async save(profile, refreshedAt, cursor) {
			const cursorFields = {
				lastRefreshedAt: refreshedAt,
				lastTrainingMessageAt: cursor.messageCreatedAt,
				lastTrainingMessageId: cursor.messageId,
			};
			await db
				.insert(guildPersonalityProfiles)
				.values({ guildId, profile, ...cursorFields })
				.onConflictDoUpdate({ target: guildPersonalityProfiles.guildId, set: { profile, ...cursorFields } });
		},
	};
}

export type GuildPersonalityBuildResult = PersonalityBuildResult;

export function buildGuildPersonalityProfile(guildId: string): Promise<PersonalityBuildResult> {
	return buildProfile(guildProfileKind(guildId));
}

function selectBalancedGuildPromptMessages(messages: TrainingMessage[]): TrainingMessage[] {
	const authorCounts = new Map<string, number>();
	const sampled: TrainingMessage[] = [];
	for (const message of messages) {
		const authorCount = authorCounts.get(message.authorUserId) ?? 0;
		if (authorCount >= MAX_MESSAGES_PER_AUTHOR) continue;
		authorCounts.set(message.authorUserId, authorCount + 1);
		sampled.push(message);
		if (sampled.length >= MAX_MESSAGES_PER_BUILD) break;
	}
	return sampled;
}

function buildAuthorLabels(messages: TrainingMessage[]): Map<string, string> {
	const authorIds = [...new Set(messages.map((message) => message.authorUserId))].sort();
	const labelsByAuthorId = new Map<string, string>();
	const usedLabels = new Map<string, string>();
	for (const authorId of authorIds) {
		const baseLabel = `Author ${stableAuthorNumber(authorId)}`;
		const existingAuthorId = usedLabels.get(baseLabel);
		const label =
			existingAuthorId && existingAuthorId !== authorId ? `${baseLabel}.${labelsByAuthorId.size + 1}` : baseLabel;
		labelsByAuthorId.set(authorId, label);
		usedLabels.set(baseLabel, authorId);
	}
	return labelsByAuthorId;
}

function stableAuthorNumber(authorId: string): number {
	let hash = 2166136261;
	for (let index = 0; index < authorId.length; index++) {
		hash ^= authorId.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 1_000_000;
}
