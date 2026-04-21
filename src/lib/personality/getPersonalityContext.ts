import { getPersonalityProfile } from "../../db/queries/personality.js";
import type { BhayanakClient } from "../BhayanakClient.js";

// Cap the injected excerpt so small models don't drown out the real system prompt.
const MAX_INJECTED_CHARS = 800;

/**
 * Returns a formatted personality context string to prepend to LLM system prompts.
 * Returns an empty string if no profile exists yet (graceful degradation).
 */
export async function getPersonalityContext(client: BhayanakClient, userId: string, guildId: string): Promise<string> {
	const cacheKey = `${userId}:${guildId}`;

	const cached = client.personalityCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const profile = await getPersonalityProfile(userId, guildId);
	const excerpt = profile
		? profile.length > MAX_INJECTED_CHARS
			? `${profile.slice(0, MAX_INJECTED_CHARS - 1)}…`
			: profile
		: "";
	const result = excerpt
		? `Context about the user you are replying to (use it to shape tone; do not describe or quote it back):\n${excerpt}\n\nYour instructions:\n`
		: "";

	client.personalityCache.set(cacheKey, result);
	return result;
}
