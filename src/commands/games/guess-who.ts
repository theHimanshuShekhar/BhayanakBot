import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";
import { buildGuessWhoPromptEmbed, buildGuessWhoRevealEmbed } from "../../lib/guessWho/embeds.js";
import { getGuessedUserId } from "../../lib/guessWho/guess.js";
import { pickLiveGuessWhoMessage } from "../../lib/guessWho/pick.js";
import {
	clearGuessWhoSession,
	createGuessWhoSession,
	GUESS_WHO_TIMEOUT_MS,
	getGuessWhoSession,
	recordWrongGuess,
} from "../../lib/guessWho/session.js";
import { HOME_SERVER_REGISTRATION } from "../../lib/homeServer.js";

const startingChannels = new Set<string>();

export class GuessWhoCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly", "HomeServerOnly"],
			help: {
				summary: "Start a Guess Who round from archived channel messages.",
				examples: ["/guess_who"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => builder.setName("guess_who").setDescription("Start a Guess Who round."),
			HOME_SERVER_REGISTRATION,
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			return interaction.reply({ content: "Guess Who can only be played in a server.", flags: MessageFlags.Ephemeral });
		}

		if (interaction.channelId !== GUESS_WHO_CHANNEL_ID) {
			return interaction.reply({
				content: "Guess Who can only be played in the configured Guess Who channel.",
				flags: MessageFlags.Ephemeral,
			});
		}

		if (getGuessWhoSession(interaction.channelId) || startingChannels.has(interaction.channelId)) {
			return interaction.reply({
				content: "A Guess Who round is already active in this channel.",
				flags: MessageFlags.Ephemeral,
			});
		}
		startingChannels.add(interaction.channelId);

		await interaction.deferReply();

		try {
			const channel = interaction.channel;
			if (!channel?.isTextBased() || !("createMessageCollector" in channel)) {
				return interaction.editReply("I could not start a Guess Who round in this channel.");
			}

			const message = await pickLiveGuessWhoMessage(
				{
					guildId: interaction.guildId,
					channelId: interaction.channelId,
					excludeAuthorUserId: interaction.user.id,
				},
				channel,
				this.container.logger,
			);

			if (!message) {
				return interaction.editReply("I need more archived chat history before starting a Guess Who round.");
			}

			await interaction.editReply({ embeds: [buildGuessWhoPromptEmbed(message)] });
			const reply = await interaction.fetchReply();

			const collector = channel.createMessageCollector({ time: GUESS_WHO_TIMEOUT_MS });
			const timeout = setTimeout(() => collector.stop("time"), GUESS_WHO_TIMEOUT_MS);
			let ended = false;
			let editQueue = Promise.resolve();

			const queuePromptEdit = (remainingGuesses: number) => {
				editQueue = editQueue
					.then(async () => {
						if (!ended) await reply.edit({ embeds: [buildGuessWhoPromptEmbed(message, remainingGuesses)] });
					})
					.catch(() => undefined);
			};

			const revealAndEnd = async (outcome: "correct" | "exhausted" | "timeout", guessedByUserId?: string) => {
				if (ended) return;
				ended = true;
				clearGuessWhoSession(interaction.channelId);
				collector.stop(outcome);
				await editQueue;

				const revealEmbed = buildGuessWhoRevealEmbed({ message, outcome, guessedByUserId });
				try {
					await reply.edit({ embeds: [revealEmbed] });
				} catch {
					await channel.send({ embeds: [revealEmbed] }).catch(() => undefined);
				}
			};

			createGuessWhoSession({
				channelId: interaction.channelId,
				messageId: reply.id,
				authorUserId: message.authorUserId,
				wrongGuesses: 0,
				timeout,
			});
			startingChannels.delete(interaction.channelId);

			collector.on("collect", async (collectedMessage) => {
				if (ended || collectedMessage.author.bot || collectedMessage.author.id === message.authorUserId) return;

				// Only a mention typed in the text is a guess; the automatic mention on a reply is not.
				const guessedUserId = getGuessedUserId(collectedMessage.content);
				if (!guessedUserId) return;

				if (guessedUserId === message.authorUserId) {
					await revealAndEnd("correct", collectedMessage.author.id);
					return;
				}

				const wrongGuess = recordWrongGuess(interaction.channelId);
				if (wrongGuess.exhausted) {
					await revealAndEnd("exhausted");
					return;
				}

				queuePromptEdit(wrongGuess.remainingGuesses);
			});

			collector.on("end", async (_collected, reason) => {
				if (ended) return;
				if (reason === "time") {
					await revealAndEnd("timeout");
				} else {
					// The collector died for another reason (e.g. the channel was deleted): free the channel.
					ended = true;
					clearGuessWhoSession(interaction.channelId);
				}
			});

			return reply;
		} finally {
			startingChannels.delete(interaction.channelId);
		}
	}
}
