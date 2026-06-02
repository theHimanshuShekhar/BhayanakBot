import { container } from "@sapphire/framework";
import { and, eq, sql } from "drizzle-orm";
import { cleanupOldMessages } from "../../db/queries/personality.js";
import { getEligibleUserTrainingMessages } from "../../db/queries/personalityTraining.js";
import { userPersonalityProfiles } from "../../db/schema.js";
import type { BhayanakClient } from "../BhayanakClient.js";
import { db } from "../database.js";
import { callBackgroundLlm } from "../llmProvider.js";

const OLLAMA_TIMEOUT_MS = 90_000;
// Prevent runaway prompts: absorb at most 100 messages or 8 000 chars per build pass.
// phi3:mini on CPU can't handle 40K chars in a reasonable time; smaller chunks finish reliably.
const MAX_MESSAGES_PER_BUILD = 100;
const MAX_CHARS_PER_BUILD = 8_000;
export const INITIAL_USER_PROFILE_THRESHOLD = 100;
export const REFRESH_USER_PROFILE_THRESHOLD = 20;
export type PersonalityBuildStatus =
	| "built"
	| "skipped_cooldown"
	| "skipped_in_progress"
	| "skipped_insufficient_evidence"
	| "skipped_model_empty";
export interface PersonalityBuildResult {
	status: PersonalityBuildStatus;
}

// Shared across all call sites (inline messageCreate trigger, /personality manual trigger,
// scheduled refresh) so concurrent builds for the same user don't race on the same archive
// cursor and clobber each other's transactions.
const rebuildInProgress = new Set<string>();

const SYSTEM_PROMPT = [
	"You are a personality analyst building a detailed psychological and social profile of a person based solely on their Discord messages.",
	"Analyze and describe the following dimensions in depth:",
	"1. Communication style — how they write, sentence structure, vocabulary, formality level, use of emojis/slang",
	"2. Humor — type of humor they use (dry, absurdist, self-deprecating, dark, wholesome, etc.), frequency, how they land jokes",
	"3. Topics and interests — recurring subjects, hobbies, passions, things they bring up unprompted",
	"4. Social dynamics — how they interact with others, are they dominant/passive, do they support others, how they handle conflict or disagreement",
	"5. Emotional tone — general mood, optimism/pessimism, what makes them excited or frustrated",
	"6. Notable quirks and phrases — recurring expressions, catchphrases, verbal tics, unusual patterns",
	"7. Patterns over time — any shifts in behavior, energy, or topics you can observe",
	"Write in flowing prose, not bullet points. Be specific and detailed — the more nuanced the better.",
	"Do not be generic. Ground every observation in evidence from the messages.",
	"Do not quote source messages directly.",
].join(" ");

export async function buildPersonalityProfile(userId: string, guildId: string): Promise<PersonalityBuildResult> {
	const rebuildKey = `${userId}:${guildId}`;
	container.logger.debug(`[personality] build requested userId=${userId} guildId=${guildId}`);
	if (rebuildInProgress.has(rebuildKey)) {
		container.logger.debug(`[personality] build skip userId=${userId} guildId=${guildId} reason=in-progress`);
		return { status: "skipped_in_progress" };
	}
	rebuildInProgress.add(rebuildKey);
	const startedAt = Date.now();
	try {
		const result = await buildPersonalityProfileUnguarded(userId, guildId);
		container.logger.debug(
			`[personality] build finished userId=${userId} guildId=${guildId} status=${result.status} durationMs=${Date.now() - startedAt}`,
		);
		return result;
	} finally {
		rebuildInProgress.delete(rebuildKey);
		container.logger.debug(`[personality] build lock released userId=${userId} guildId=${guildId}`);
	}
}

const MIN_BUILD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function buildPersonalityProfileUnguarded(userId: string, guildId: string): Promise<PersonalityBuildResult> {
	container.logger.debug(`[personality] cleanup-old-messages start userId=${userId} guildId=${guildId}`);
	// Clean up stale messages before building to keep the table lean
	await cleanupOldMessages();
	container.logger.debug(`[personality] cleanup-old-messages complete userId=${userId} guildId=${guildId}`);

	const row = await db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, guildId)),
		columns: { profile: true, lastRefreshedAt: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
	});

	container.logger.debug(
		`[personality] profile-row userId=${userId} guildId=${guildId} exists=${row ? "yes" : "no"} hasProfile=${row?.profile ? "yes" : "no"} lastRefreshedAt=${row?.lastRefreshedAt?.toISOString() ?? "none"} cursorAt=${row?.lastTrainingMessageAt?.toISOString() ?? "none"} cursorId=${row?.lastTrainingMessageId ?? "none"}`,
	);

	const messages = await getEligibleUserTrainingMessages({
		guildId,
		userId,
		afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null,
		afterMessageId: row?.lastTrainingMessageId ?? null,
		limit: MAX_MESSAGES_PER_BUILD,
	});
	container.logger.debug(
		`[personality] evidence-window userId=${userId} guildId=${guildId} fetched=${messages.length} max=${MAX_MESSAGES_PER_BUILD} firstMessageAt=${messages[0]?.messageCreatedAt.toISOString() ?? "none"} lastMessageAt=${messages.at(-1)?.messageCreatedAt.toISOString() ?? "none"}`,
	);
	if (messages.length === 0) {
		container.logger.debug(`[personality] build skip userId=${userId} guildId=${guildId} reason=no-eligible-messages`);
		return { status: "skipped_insufficient_evidence" };
	}

	const existingProfile = row?.profile ?? null;
	const threshold = existingProfile ? REFRESH_USER_PROFILE_THRESHOLD : INITIAL_USER_PROFILE_THRESHOLD;
	container.logger.debug(
		`[personality] threshold userId=${userId} guildId=${guildId} mode=${existingProfile ? "refresh" : "initial"} threshold=${threshold} fetched=${messages.length}`,
	);
	if (messages.length < threshold) {
		container.logger.debug(
			`[personality] build skip userId=${userId} guildId=${guildId} reason=insufficient-evidence fetched=${messages.length} threshold=${threshold}`,
		);
		return { status: "skipped_insufficient_evidence" };
	}

	// Cooldown: don't hammer Ollama if builds fail or user spams messages
	if (row?.lastRefreshedAt && Date.now() - row.lastRefreshedAt.getTime() < MIN_BUILD_INTERVAL_MS) {
		container.logger.debug(
			`[personality] build skip userId=${userId} guildId=${guildId} reason=cooldown remainingMs=${MIN_BUILD_INTERVAL_MS - (Date.now() - row.lastRefreshedAt.getTime())}`,
		);
		return { status: "skipped_cooldown" };
	}

	// Build the message block chronologically while respecting the size caps.
	let messageBlock = "";
	const processed: typeof messages = [];
	for (const m of messages) {
		if (messageBlock.length + m.content.length > MAX_CHARS_PER_BUILD) break;
		messageBlock += (messageBlock ? "\n" : "") + m.content;
		processed.push(m);
	}
	if (processed.length === 0) {
		container.logger.debug(
			`[personality] build skip userId=${userId} guildId=${guildId} reason=message-block-empty fetched=${messages.length} maxChars=${MAX_CHARS_PER_BUILD}`,
		);
		return { status: "skipped_insufficient_evidence" };
	}
	container.logger.debug(
		`[personality] prompt-evidence userId=${userId} guildId=${guildId} processed=${processed.length} fetched=${messages.length} messageBlockLength=${messageBlock.length} maxChars=${MAX_CHARS_PER_BUILD}`,
	);

	const userPrompt = existingProfile
		? [
				"Current personality profile:",
				existingProfile,
				"",
				"New messages from this person since the last profile update:",
				messageBlock,
				"",
				"Refine and expand the personality profile by incorporating insights from the new messages. Keep all previous observations that still hold true and deepen them. Add new observations where the new messages reveal something not previously captured.",
			].join("\n")
		: [
				"Messages from this person:",
				messageBlock,
				"",
				"Build a detailed personality profile based on these messages.",
			].join("\n");

	const client = container.client as BhayanakClient;

	container.logger.debug(
		`[personality] llm-call userId=${userId} guildId=${guildId} promptLength=${userPrompt.length} systemLength=${SYSTEM_PROMPT.length} timeoutMs=${OLLAMA_TIMEOUT_MS}`,
	);
	const llmStartedAt = Date.now();
	const result = await callBackgroundLlm(SYSTEM_PROMPT, userPrompt, OLLAMA_TIMEOUT_MS, undefined, "personality:user");
	container.logger.debug(
		`[personality] llm-result userId=${userId} guildId=${guildId} result=${result ? `present length=${result.length}` : "null"} durationMs=${Date.now() - llmStartedAt}`,
	);
	if (!result) {
		container.logger.warn(
			`[personality] Ollama returned null for userId=${userId} guildId=${guildId}, skipping profile update`,
		);
		container.logger.debug(
			`[personality] storage-empty-result userId=${userId} guildId=${guildId} action=touch-lastRefreshedAt`,
		);
		await db
			.insert(userPersonalityProfiles)
			.values({ userId, guildId, lastRefreshedAt: new Date() })
			.onConflictDoUpdate({
				target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
				set: { lastRefreshedAt: new Date() },
			});
		return { status: "skipped_model_empty" };
	}

	const newestProcessedMessage = processed[processed.length - 1];
	if (!newestProcessedMessage) {
		container.logger.debug(
			`[personality] build skip userId=${userId} guildId=${guildId} reason=no-newest-processed-message`,
		);
		return { status: "skipped_insufficient_evidence" };
	}
	const refreshedAt = new Date();
	container.logger.debug(
		`[personality] storage-upsert start userId=${userId} guildId=${guildId} processed=${processed.length} profileLength=${result.length} cursorAt=${newestProcessedMessage.messageCreatedAt.toISOString()} cursorId=${newestProcessedMessage.messageId}`,
	);

	// Atomic: upsert profile and advance the archive cursor in one transaction.
	// Decrement counter by absorbed count instead of resetting to 0 — this preserves
	// increments from messages that arrived during the (potentially long) Ollama call.
	await db.transaction(async (tx) => {
		await tx
			.insert(userPersonalityProfiles)
			.values({
				userId,
				guildId,
				profile: result,
				newMessageCount: 0,
				lastRefreshedAt: refreshedAt,
				lastTrainingMessageAt: newestProcessedMessage.messageCreatedAt,
				lastTrainingMessageId: newestProcessedMessage.messageId,
			})
			.onConflictDoUpdate({
				target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
				set: {
					profile: result,
					newMessageCount: sql`GREATEST(0, ${userPersonalityProfiles.newMessageCount} - ${processed.length})`,
					lastRefreshedAt: refreshedAt,
					lastTrainingMessageAt: newestProcessedMessage.messageCreatedAt,
					lastTrainingMessageId: newestProcessedMessage.messageId,
				},
			});
	});
	container.logger.debug(`[personality] storage-upsert complete userId=${userId} guildId=${guildId}`);

	// Invalidate in-memory cache so the next response picks up the fresh profile
	const cacheKey = `${userId}:${guildId}`;
	const hadCacheEntry = client.personalityCache.delete(cacheKey);
	container.logger.debug(
		`[personality] cache invalidate userId=${userId} guildId=${guildId} hadEntry=${hadCacheEntry}`,
	);

	container.logger.debug(
		`[personality] Profile updated for userId=${userId} guildId=${guildId} (${processed.length}/${messages.length} messages processed)`,
	);
	return { status: "built" };
}
