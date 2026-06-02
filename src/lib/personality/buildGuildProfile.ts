import { container } from "@sapphire/framework";
import { eq, sql } from "drizzle-orm";
import { getEligibleGuildTrainingMessageWindow, type TrainingMessage } from "../../db/queries/personalityTraining.js";
import { guildPersonalityProfiles } from "../../db/schema.js";
import type { BhayanakClient } from "../BhayanakClient.js";
import { db } from "../database.js";
import { callBackgroundLlm } from "../llmProvider.js";

const OLLAMA_TIMEOUT_MS = 90_000;
const MAX_MESSAGES_PER_BUILD = 200;
const MAX_CHARS_PER_BUILD = 8_000;
export const INITIAL_GUILD_PROFILE_THRESHOLD = 200;
export const REFRESH_GUILD_PROFILE_THRESHOLD = 40;
const MIN_BUILD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export type GuildPersonalityBuildStatus =
	| "built"
	| "skipped_cooldown"
	| "skipped_in_progress"
	| "skipped_insufficient_evidence"
	| "skipped_model_empty";
export interface GuildPersonalityBuildResult {
	status: GuildPersonalityBuildStatus;
}

const rebuildInProgress = new Set<string>();

const SYSTEM_PROMPT = [
	"You are a cultural anthropologist analyzing the personality, culture, and vibe of a Discord server based on its messages.",
	"Analyze and describe the following dimensions:",
	"1. Overall tone — formal, casual, chaotic, wholesome, edgy, supportive, competitive?",
	"2. Humor style — what kinds of jokes land here, meme culture, inside jokes",
	"3. Shared interests — games, topics, hobbies that dominate conversation",
	"4. Social dynamics — how members interact, power structures, friend groups",
	"5. Notable phrases and slang — recurring expressions, emojis, abbreviations",
	"6. Conflict style — how disagreements are handled, drama levels",
	"7. What makes this server unique — distinct characteristics vs generic Discord servers",
	"Write in flowing prose, not bullet points. Be specific and detailed.",
	"Do not be generic. Ground every observation in evidence from the messages.",
	"Do not quote source messages directly.",
].join(" ");

export async function buildGuildPersonalityProfile(guildId: string): Promise<GuildPersonalityBuildResult> {
	container.logger.debug(`[guild-personality] build requested guildId=${guildId}`);
	if (rebuildInProgress.has(guildId)) {
		container.logger.debug(`[guild-personality] build skip guildId=${guildId} reason=in-progress`);
		return { status: "skipped_in_progress" };
	}
	rebuildInProgress.add(guildId);
	const startedAt = Date.now();
	try {
		const result = await buildGuildPersonalityProfileUnguarded(guildId);
		container.logger.debug(
			`[guild-personality] build finished guildId=${guildId} status=${result.status} durationMs=${Date.now() - startedAt}`,
		);
		return result;
	} finally {
		rebuildInProgress.delete(guildId);
		container.logger.debug(`[guild-personality] build lock released guildId=${guildId}`);
	}
}

async function buildGuildPersonalityProfileUnguarded(guildId: string): Promise<GuildPersonalityBuildResult> {
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { profile: true, lastRefreshedAt: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
	});

	container.logger.debug(
		`[guild-personality] profile-row guildId=${guildId} exists=${row ? "yes" : "no"} hasProfile=${row?.profile ? "yes" : "no"} lastRefreshedAt=${row?.lastRefreshedAt?.toISOString() ?? "none"} cursorAt=${row?.lastTrainingMessageAt?.toISOString() ?? "none"} cursorId=${row?.lastTrainingMessageId ?? "none"}`,
	);

	const existingProfile = row?.profile ?? null;
	const threshold = existingProfile ? REFRESH_GUILD_PROFILE_THRESHOLD : INITIAL_GUILD_PROFILE_THRESHOLD;
	container.logger.debug(
		`[guild-personality] threshold guildId=${guildId} mode=${existingProfile ? "refresh" : "initial"} threshold=${threshold}`,
	);
	const messages = await getEligibleGuildTrainingMessageWindow({
		guildId,
		afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null,
		afterMessageId: row?.lastTrainingMessageId ?? null,
		limit: threshold,
	});
	container.logger.debug(
		`[guild-personality] evidence-window guildId=${guildId} fetched=${messages.length} threshold=${threshold} firstMessageAt=${messages[0]?.messageCreatedAt.toISOString() ?? "none"} lastMessageAt=${messages.at(-1)?.messageCreatedAt.toISOString() ?? "none"}`,
	);
	if (messages.length === 0) {
		container.logger.debug(`[guild-personality] build skip guildId=${guildId} reason=no-eligible-messages`);
		return { status: "skipped_insufficient_evidence" };
	}

	if (messages.length < threshold) {
		container.logger.debug(
			`[guild-personality] build skip guildId=${guildId} reason=insufficient-evidence fetched=${messages.length} threshold=${threshold}`,
		);
		return { status: "skipped_insufficient_evidence" };
	}

	// Cooldown: don't hammer Ollama if builds fail or server is extremely active
	if (row?.lastRefreshedAt && Date.now() - row.lastRefreshedAt.getTime() < MIN_BUILD_INTERVAL_MS) {
		container.logger.debug(
			`[guild-personality] build skip guildId=${guildId} reason=cooldown remainingMs=${MIN_BUILD_INTERVAL_MS - (Date.now() - row.lastRefreshedAt.getTime())}`,
		);
		return { status: "skipped_cooldown" };
	}

	const sampledMessages = selectBalancedGuildPromptMessages(messages);
	const authorLabels = buildAuthorLabels(messages);
	container.logger.debug(
		`[guild-personality] sampling guildId=${guildId} fetched=${messages.length} sampled=${sampledMessages.length} uniqueAuthors=${authorLabels.size} maxMessages=${MAX_MESSAGES_PER_BUILD}`,
	);
	let messageBlock = "";
	let messageBlockLines = 0;
	for (const m of sampledMessages) {
		const line = `${authorLabels.get(m.authorUserId)}: ${m.content}`;
		if (messageBlock.length + line.length > MAX_CHARS_PER_BUILD) break;
		messageBlock += (messageBlock ? "\n" : "") + line;
		messageBlockLines++;
	}
	if (messageBlock.length === 0) {
		container.logger.debug(
			`[guild-personality] build skip guildId=${guildId} reason=message-block-empty sampled=${sampledMessages.length} maxChars=${MAX_CHARS_PER_BUILD}`,
		);
		return { status: "skipped_insufficient_evidence" };
	}
	container.logger.debug(
		`[guild-personality] prompt-evidence guildId=${guildId} messageBlockLines=${messageBlockLines} messageBlockLength=${messageBlock.length} maxChars=${MAX_CHARS_PER_BUILD}`,
	);

	const userPrompt = existingProfile
		? [
				"Current server culture profile:",
				existingProfile,
				"",
				"New messages from this server:",
				messageBlock,
				"",
				"Refine and expand the server culture profile. Keep previous observations that still hold true and deepen them.",
			].join("\n")
		: ["Messages from this Discord server:", messageBlock, "", "Build a detailed culture profile of this server."].join(
				"\n",
			);

	const client = container.client as BhayanakClient;

	container.logger.debug(
		`[guild-personality] llm-call guildId=${guildId} promptLength=${userPrompt.length} systemLength=${SYSTEM_PROMPT.length} timeoutMs=${OLLAMA_TIMEOUT_MS}`,
	);
	const llmStartedAt = Date.now();
	const result = await callBackgroundLlm(SYSTEM_PROMPT, userPrompt, OLLAMA_TIMEOUT_MS, undefined, "personality:guild");
	container.logger.debug(
		`[guild-personality] llm-result guildId=${guildId} result=${result ? `present length=${result.length}` : "null"} durationMs=${Date.now() - llmStartedAt}`,
	);
	if (!result) {
		container.logger.warn(`[guild-personality] Ollama returned null for guildId=${guildId}, skipping profile update`);
		container.logger.debug(`[guild-personality] storage-empty-result guildId=${guildId} action=touch-lastRefreshedAt`);
		await db
			.insert(guildPersonalityProfiles)
			.values({ guildId, lastRefreshedAt: new Date() })
			.onConflictDoUpdate({
				target: guildPersonalityProfiles.guildId,
				set: { lastRefreshedAt: new Date() },
			});
		return { status: "skipped_model_empty" };
	}

	const newestProcessedMessage = messages[messages.length - 1];
	if (!newestProcessedMessage) {
		container.logger.debug(`[guild-personality] build skip guildId=${guildId} reason=no-newest-processed-message`);
		return { status: "skipped_insufficient_evidence" };
	}
	const refreshedAt = new Date();
	container.logger.debug(
		`[guild-personality] storage-upsert start guildId=${guildId} absorbed=${messages.length} sampled=${sampledMessages.length} profileLength=${result.length} cursorAt=${newestProcessedMessage.messageCreatedAt.toISOString()} cursorId=${newestProcessedMessage.messageId}`,
	);

	await db.transaction(async (tx) => {
		await tx
			.insert(guildPersonalityProfiles)
			.values({
				guildId,
				profile: result,
				messageCount: 0,
				lastRefreshedAt: refreshedAt,
				lastTrainingMessageAt: newestProcessedMessage.messageCreatedAt,
				lastTrainingMessageId: newestProcessedMessage.messageId,
			})
			.onConflictDoUpdate({
				target: guildPersonalityProfiles.guildId,
				set: {
					profile: result,
					messageCount: sql`GREATEST(0, ${guildPersonalityProfiles.messageCount} - ${messages.length})`,
					lastRefreshedAt: refreshedAt,
					lastTrainingMessageAt: newestProcessedMessage.messageCreatedAt,
					lastTrainingMessageId: newestProcessedMessage.messageId,
				},
			});
	});
	container.logger.debug(`[guild-personality] storage-upsert complete guildId=${guildId}`);

	// Invalidate cache
	const hadCacheEntry = client.guildPersonalityCache.delete(guildId);
	container.logger.debug(`[guild-personality] cache invalidate guildId=${guildId} hadEntry=${hadCacheEntry}`);

	container.logger.debug(
		`[guild-personality] Profile updated for guildId=${guildId} (${sampledMessages.length}/${messages.length} messages sampled)`,
	);
	return { status: "built" };
}

function selectBalancedGuildPromptMessages(messages: TrainingMessage[]): TrainingMessage[] {
	const authorCounts = new Map<string, number>();
	const sampled: TrainingMessage[] = [];
	for (const message of messages) {
		const authorCount = authorCounts.get(message.authorUserId) ?? 0;
		if (authorCount >= 10) continue;
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
