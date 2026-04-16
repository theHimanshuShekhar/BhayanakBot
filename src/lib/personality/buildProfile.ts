import { container } from "@sapphire/framework";
import { inArray, sql } from "drizzle-orm";
import { callOllama } from "../ollama.js";
import { getPersonalityProfile, getUnabsorbedMessages } from "../../db/queries/personality.js";
import { db } from "../database.js";
import { userMessages, userPersonalityProfiles } from "../../db/schema.js";
import type { BhayanakClient } from "../BhayanakClient.js";

const OLLAMA_TIMEOUT_MS = 120_000;
// Prevent runaway prompts: absorb at most 500 messages or 40 000 chars per build pass.
// Any remaining messages stay in user_messages and are picked up in the next cycle.
const MAX_MESSAGES_PER_BUILD = 500;
const MAX_CHARS_PER_BUILD = 40_000;

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
].join(" ");

export async function buildPersonalityProfile(userId: string, guildId: string): Promise<void> {
	const messages = await getUnabsorbedMessages(userId, guildId);
	if (messages.length === 0) return;

	const existingProfile = await getPersonalityProfile(userId, guildId);

	// Build the message block, respecting the size caps (take the most recent messages first)
	let messageBlock = "";
	const absorbed: typeof messages = [];
	for (const m of messages.slice(-MAX_MESSAGES_PER_BUILD)) {
		if (messageBlock.length + m.content.length > MAX_CHARS_PER_BUILD) break;
		messageBlock += (messageBlock ? "\n" : "") + m.content;
		absorbed.push(m);
	}
	if (absorbed.length === 0) return;

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

	const result = await callOllama(SYSTEM_PROMPT, userPrompt, OLLAMA_TIMEOUT_MS);
	if (!result) {
		container.logger.warn(`[personality] Ollama returned null for userId=${userId} guildId=${guildId}, skipping profile update`);
		return;
	}

	// Atomic: upsert profile + delete only the absorbed messages in one transaction.
	// Decrement counter by absorbed count instead of resetting to 0 — this preserves
	// increments from messages that arrived during the (potentially long) Ollama call.
	await db.transaction(async (tx) => {
		await tx
			.insert(userPersonalityProfiles)
			.values({ userId, guildId, profile: result, newMessageCount: 0, lastRefreshedAt: new Date() })
			.onConflictDoUpdate({
				target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
				set: {
					profile: result,
					newMessageCount: sql`GREATEST(0, ${userPersonalityProfiles.newMessageCount} - ${absorbed.length})`,
					lastRefreshedAt: new Date(),
				},
			});
		await tx.delete(userMessages).where(inArray(userMessages.id, absorbed.map((m) => m.id)));
	});

	// Invalidate in-memory cache so the next response picks up the fresh profile
	const client = container.client as BhayanakClient;
	client.personalityCache.delete(`${userId}:${guildId}`);

	container.logger.debug(
		`[personality] Profile updated for userId=${userId} guildId=${guildId} (${absorbed.length}/${messages.length} messages absorbed)`,
	);
}
