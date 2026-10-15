import { RESTJSONErrorCodes } from "discord.js";
import {
	type GuessWhoArchivedMessage,
	getRandomGuessWhoMessage,
	markArchivedChannelMessageDeleted,
} from "../../db/queries/archivedChannelMessages.js";
import { isDiscordApiError } from "../discordErrors.js";

const MAX_PICK_ATTEMPTS = 5;

type PickInput = Parameters<typeof getRandomGuessWhoMessage>[0];

/**
 * Picks a Game-Eligible Message that still exists on Discord. A message found gone is marked deleted in the
 * archive and another is drawn; any other fetch failure only skips the candidate for this round.
 */
export async function pickLiveGuessWhoMessage(
	query: Omit<PickInput, "excludeMessageIds">,
	channel: { messages: { fetch(messageId: string): Promise<unknown> } },
	logger?: { warn(message: string, error: unknown): unknown },
): Promise<GuessWhoArchivedMessage | null> {
	const skippedMessageIds: string[] = [];

	for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS; attempt++) {
		const candidate = await getRandomGuessWhoMessage({ ...query, excludeMessageIds: skippedMessageIds });
		if (!candidate) return null;

		try {
			await channel.messages.fetch(candidate.messageId);
			return candidate;
		} catch (err) {
			skippedMessageIds.push(candidate.messageId);
			if (isDiscordApiError(err, RESTJSONErrorCodes.UnknownMessage)) {
				await markArchivedChannelMessageDeleted(candidate.messageId);
			} else {
				logger?.warn(`[guess-who] Could not verify message ${candidate.messageId}; skipping it for this round:`, err);
			}
		}
	}

	return null;
}
