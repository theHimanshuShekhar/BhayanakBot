import { container } from "@sapphire/framework";
import { eq } from "drizzle-orm";
import {
	getGuildMessageCount,
	getGuildPersonalityProfile,
	getRecentGuildMessages,
	resetGuildMessageCount,
	updateGuildPersonalityProfile,
} from "../../db/queries/guildPersonality.js";
import { guildPersonalityProfiles } from "../../db/schema.js";
import type { BhayanakClient } from "../BhayanakClient.js";
import { db } from "../database.js";
import { callOllamaLowPriority } from "../ollama.js";

const OLLAMA_TIMEOUT_MS = 90_000;
const MAX_MESSAGES_PER_BUILD = 100;
const MAX_CHARS_PER_BUILD = 8_000;
const BUILD_THRESHOLD = 200; // Build after 200 new messages
const MIN_BUILD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
].join(" ");

export async function buildGuildPersonalityProfile(guildId: string): Promise<void> {
	if (rebuildInProgress.has(guildId)) return;
	rebuildInProgress.add(guildId);
	try {
		await buildGuildPersonalityProfileUnguarded(guildId);
	} finally {
		rebuildInProgress.delete(guildId);
	}
}

async function buildGuildPersonalityProfileUnguarded(guildId: string): Promise<void> {
	const messageCount = await getGuildMessageCount(guildId);
	if (messageCount < BUILD_THRESHOLD) {
		container.logger.debug(
			`[guild-personality] Skipping build for ${guildId}: only ${messageCount} messages (threshold: ${BUILD_THRESHOLD})`,
		);
		return;
	}

	// Cooldown: don't hammer Ollama if builds fail or server is extremely active
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { lastRefreshedAt: true },
	});
	if (row?.lastRefreshedAt && Date.now() - row.lastRefreshedAt.getTime() < MIN_BUILD_INTERVAL_MS) {
		container.logger.debug(`[guild-personality] Skipping build for guildId=${guildId}: cooldown active`);
		return;
	}

	const messages = await getRecentGuildMessages(guildId, MAX_MESSAGES_PER_BUILD);
	if (messages.length === 0) return;

	const existingProfile = await getGuildPersonalityProfile(guildId);

	let messageBlock = "";
	for (const m of messages.slice(-MAX_MESSAGES_PER_BUILD)) {
		if (messageBlock.length + m.content.length > MAX_CHARS_PER_BUILD) break;
		messageBlock += (messageBlock ? "\n" : "") + m.content;
	}
	if (messageBlock.length === 0) return;

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

	// Try to resolve the guild name for logging
	const client = container.client as BhayanakClient;
	const guild = client.guilds.cache.get(guildId);
	const label = guild ? `${guild.name} (id=${guildId})` : `guild id=${guildId}`;

	const result = await callOllamaLowPriority(SYSTEM_PROMPT, userPrompt, OLLAMA_TIMEOUT_MS, undefined, label);
	if (!result) {
		container.logger.warn(`[guild-personality] Ollama returned null for guildId=${guildId}, skipping profile update`);
		// Self-heal: reset messageCount to actual recent message count so we don't keep retrying with stale inflated count
		const recentMessages = await getRecentGuildMessages(guildId, MAX_MESSAGES_PER_BUILD);
		await resetGuildMessageCount(guildId, recentMessages.length);
		return;
	}

	await updateGuildPersonalityProfile(guildId, result);

	// Invalidate cache
	client.guildPersonalityCache.delete(guildId);

	container.logger.debug(
		`[guild-personality] Profile updated for guildId=${guildId} (${messages.length} messages analyzed)`,
	);
}
