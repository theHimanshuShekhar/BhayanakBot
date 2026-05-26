import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getRandomGuessWhoMessage } from "../../db/queries/archivedChannelMessages.js";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";
import { buildGuessWhoPromptEmbed, buildGuessWhoRevealEmbed } from "../../lib/guessWho/embeds.js";
import {
	clearGuessWhoSession,
	createGuessWhoSession,
	GUESS_WHO_TIMEOUT_MS,
	getGuessWhoSession,
	recordWrongGuess,
} from "../../lib/guessWho/session.js";

const startingChannels = new Set<string>();

export class GuessWhoCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Start a Guess Who round from archived channel messages.",
				examples: ["/guess_who"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("guess_who").setDescription("Start a Guess Who round."),
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
			const message = await getRandomGuessWhoMessage({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				excludeAuthorUserId: interaction.user.id,
			});

			if (!message) {
				return interaction.editReply("I need more archived chat history before starting a Guess Who round.");
			}

			await interaction.editReply({ embeds: [buildGuessWhoPromptEmbed(message)] });
			const reply = await interaction.fetchReply();
			const channel = interaction.channel;

			if (!channel?.isTextBased() || !("createMessageCollector" in channel)) {
				return interaction.editReply("I could not start a Guess Who round in this channel.");
			}

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
				await editQueue;

				const revealEmbed = buildGuessWhoRevealEmbed({ message, outcome, guessedByUserId });
				try {
					await reply.edit({ embeds: [revealEmbed] });
				} catch {
					await channel.send({ embeds: [revealEmbed] });
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

				const guessedUser = collectedMessage.mentions.users.first();
				if (!guessedUser) return;

				if (guessedUser.id === message.authorUserId) {
					collector.stop("correct");
					await revealAndEnd("correct", collectedMessage.author.id);
					return;
				}

				const wrongGuess = recordWrongGuess(interaction.channelId);
				if (wrongGuess.exhausted) {
					collector.stop("exhausted");
					await revealAndEnd("exhausted");
					return;
				}

				queuePromptEdit(wrongGuess.remainingGuesses);
			});

			collector.on("end", async (_collected, reason) => {
				if (reason === "time") {
					await revealAndEnd("timeout");
				}
			});

			return reply;
		} finally {
			startingChannels.delete(interaction.channelId);
		}
	}
}
