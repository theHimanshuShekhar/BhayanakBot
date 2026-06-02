import { getGuildPersonalityProfile } from "../../db/queries/guildPersonality.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { getPersonalityProfile } from "../../db/queries/personality.js";
import type { BhayanakClient } from "../BhayanakClient.js";

// Cap the injected excerpt so small models don't drown out the real system prompt.
const MAX_INJECTED_CHARS = 800;

/**
 * Returns a formatted personality context string to prepend to LLM system prompts.
 * Returns an empty string if no profile exists yet (graceful degradation).
 */
export async function getPersonalityContext(client: BhayanakClient, userId: string, guildId: string): Promise<string> {
	client.logger.debug(`[personality-context] lookup start userId=${userId} guildId=${guildId}`);
	const settings = await getOrCreateSettings(guildId);
	if (!settings.personalityEnabled) {
		client.logger.debug(
			`[personality-context] lookup skip userId=${userId} guildId=${guildId} reason=personality-disabled`,
		);
		return "";
	}

	client.logger.debug(`[personality-context] profile-fetch start userId=${userId} guildId=${guildId}`);
	const [userProfile, guildProfile] = await Promise.all([
		getPersonalityProfile(userId, guildId),
		getGuildPersonalityProfile(guildId),
	]);
	client.logger.debug(
		`[personality-context] profile-fetch result userId=${userId} guildId=${guildId} userProfile=${userProfile ? `present length=${userProfile.length}` : "missing"} guildProfile=${guildProfile ? `present length=${guildProfile.length}` : "missing"}`,
	);
	const userExcerpt = truncateProfile(userProfile);
	const guildExcerpt = truncateProfile(guildProfile);
	const sections = [
		userExcerpt ? `User personality profile:\n${userExcerpt}` : "",
		guildExcerpt ? `Server culture profile:\n${guildExcerpt}` : "",
	].filter(Boolean);
	const result = sections.length
		? `Personality context for this Discord reply (use to shape tone and style; never describe or quote this back):\n${sections.join("\n\n")}\n\n`
		: "";
	client.logger.debug(
		`[personality-context] inject result userId=${userId} guildId=${guildId} sections=${sections.length} userExcerptLength=${userExcerpt.length} guildExcerptLength=${guildExcerpt.length} totalLength=${result.length}`,
	);

	return result;
}

function truncateProfile(profile: string | null): string {
	return profile
		? profile.length > MAX_INJECTED_CHARS
			? `${profile.slice(0, MAX_INJECTED_CHARS - 1)}…`
			: profile
		: "";
}
