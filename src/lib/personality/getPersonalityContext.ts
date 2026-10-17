import { getGuildPersonalityProfile } from "../../db/queries/guildPersonality.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { getPersonalityProfile } from "../../db/queries/personality.js";
import type { BhayanakClient } from "../BhayanakClient.js";

/**
 * Returns a formatted personality context string to prepend to LLM system prompts.
 * Returns an empty string if no profile exists yet (graceful degradation).
 * `memberProfile: false` leaves out the member's profile, so only the server culture profile is injected.
 */
export async function getPersonalityContext(
	client: BhayanakClient,
	userId: string,
	guildId: string,
	options: { memberProfile?: boolean } = {},
): Promise<string> {
	const { memberProfile = true } = options;
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
		memberProfile ? getPersonalityProfile(userId, guildId) : Promise.resolve(null),
		getGuildPersonalityProfile(guildId),
	]);
	client.logger.debug(
		`[personality-context] profile-fetch result userId=${userId} guildId=${guildId} userProfile=${userProfile ? `present length=${userProfile.length}` : "missing"} guildProfile=${guildProfile ? `present length=${guildProfile.length}` : "missing"}`,
	);
	// Profiles are stored within a fixed size (about 1,500 characters), so they are injected whole.
	const sections = [
		userProfile ? `User personality profile:\n${userProfile}` : "",
		guildProfile ? `Server culture profile:\n${guildProfile}` : "",
	].filter(Boolean);
	const result = sections.length
		? `Personality context for this Discord reply (use to shape tone and style; never describe or quote this back):\n${sections.join("\n\n")}\n\n`
		: "";
	client.logger.debug(
		`[personality-context] inject result userId=${userId} guildId=${guildId} sections=${sections.length} totalLength=${result.length}`,
	);

	return result;
}
