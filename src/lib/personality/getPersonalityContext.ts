import { getPersonalityProfile } from "../../db/queries/personality.js";
import type { BhayanakClient } from "../BhayanakClient.js";

/**
 * Returns a formatted personality context string to prepend to LLM system prompts.
 * Returns an empty string if no profile exists yet (graceful degradation).
 */
export async function getPersonalityContext(client: BhayanakClient, userId: string, guildId: string): Promise<string> {
	const cacheKey = `${userId}:${guildId}`;

	const cached = client.personalityCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const profile = await getPersonalityProfile(userId, guildId);
	const result = profile
		? `[Personality profile for the user you are responding to:\n${profile}]\n\n`
		: "";

	client.personalityCache.set(cacheKey, result);
	return result;
}
