import { EmbedBuilder } from "discord.js";
import type { GuessWhoArchivedMessage } from "../../db/queries/archivedChannelMessages.js";
import { GUESS_WHO_MAX_WRONG_GUESSES } from "./session.js";

export function buildGuessWhoPromptEmbed(
	message: GuessWhoArchivedMessage,
	remainingGuesses = GUESS_WHO_MAX_WRONG_GUESSES,
) {
	return new EmbedBuilder()
		.setTitle("Guess Who?")
		.setDescription(`> ${message.content}`)
		.setColor(0x9b59b6)
		.addFields({ name: "How to play", value: "Mention the user who sent this message." })
		.setFooter({ text: `${remainingGuesses} guesses remaining` })
		.setTimestamp();
}

export function buildGuessWhoRevealEmbed(input: {
	message: GuessWhoArchivedMessage;
	outcome: "correct" | "exhausted" | "timeout";
	guessedByUserId?: string;
}) {
	const sentUnix = Math.floor(input.message.messageCreatedAt.getTime() / 1000);
	const sourceUrl = `https://discord.com/channels/${input.message.guildId}/${input.message.channelId}/${input.message.messageId}`;
	const title =
		input.outcome === "correct" ? "Correct Guess!" : input.outcome === "timeout" ? "Time's Up!" : "Answer Revealed";
	const outcomeText =
		input.outcome === "correct" && input.guessedByUserId
			? `<@${input.guessedByUserId}> guessed correctly.`
			: input.outcome === "timeout"
				? "The round timed out."
				: "The channel used all 3 guesses.";

	return new EmbedBuilder()
		.setTitle(title)
		.setDescription(`> ${input.message.content}`)
		.setColor(input.outcome === "correct" ? 0x57f287 : 0xfee75c)
		.addFields(
			{ name: "Author", value: `<@${input.message.authorUserId}> (${input.message.authorDisplayName})`, inline: true },
			{ name: "Sent", value: `<t:${sentUnix}:R>`, inline: true },
			{ name: "Message ID", value: input.message.messageId, inline: false },
			{ name: "Source", value: `[Jump to message](${sourceUrl})`, inline: false },
			{ name: "Outcome", value: outcomeText, inline: false },
		)
		.setTimestamp();
}
