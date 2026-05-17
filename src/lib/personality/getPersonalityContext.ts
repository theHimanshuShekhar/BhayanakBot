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
		? `Personality context for the user you are replying to (use to shape tone and style; never describe or quote this back):\n${excerpt}\n\n`
		: "";

	client.personalityCache.set(cacheKey, result);
	return result;
}
