import { Subcommand } from "@sapphire/plugin-subcommands";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from "discord.js";
import ms from "ms";
import { createGiveaway, getGiveawayByMessage, endGiveaway } from "../../db/queries/giveaways.js";

export class GiveawayCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "start", chatInputRun: "runStart" },
				{ name: "end", chatInputRun: "runEnd" },
				{ name: "reroll", chatInputRun: "runReroll" },
			],
			preconditions: ["GuildOnly", "IsModerator"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("giveaway")
				.setDescription("Giveaway management")
				.addSubcommand((sub) =>
					sub
						.setName("start")
						.setDescription("Start a giveaway")
						.addStringOption((opt) =>
							opt.setName("duration").setDescription("Duration (e.g. 10m, 1h, 1d)").setRequired(true),
						)
						.addStringOption((opt) => opt.setName("prize").setDescription("What are you giving away?").setRequired(true))
						.addIntegerOption((opt) =>
							opt.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setRequired(false),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("end")
						.setDescription("End a giveaway early")
						.addStringOption((opt) =>
							opt.setName("message-id").setDescription("Message ID of the giveaway").setRequired(true),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("reroll")
						.setDescription("Reroll winners for an ended giveaway")
						.addStringOption((opt) =>
							opt.setName("message-id").setDescription("Message ID of the giveaway").setRequired(true),
						),
				),
		);
	}

	public async runStart(interaction: Subcommand.ChatInputCommandInteraction) {
		const durationStr = interaction.options.getString("duration", true);
		const prize = interaction.options.getString("prize", true);
		const winnerCount = interaction.options.getInteger("winners") ?? 1;

		const duration = ms(durationStr as any) as unknown as number;
		if (!duration || duration <= 0) {
			return interaction.reply({ content: "Invalid duration. Use e.g. `10m`, `1h`, `1d`.", ephemeral: true });
		}

		const endsAt = new Date(Date.now() + duration);

		const embed = new EmbedBuilder()
			.setTitle("🎉 Giveaway!")
			.setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)
			.setColor(0xff73fa)
			.setFooter({ text: `Hosted by ${interaction.user.tag}` })
			.setTimestamp(endsAt);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("giveaway:enter")
				.setLabel("Enter Giveaway")
				.setStyle(ButtonStyle.Primary)
				.setEmoji("🎉"),
		);

		await interaction.deferReply({ ephemeral: true });
		const msg = await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });

		await createGiveaway({
			messageId: msg.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			prize,
			winnerCount,
			endsAt,
			hostId: interaction.user.id,
		});

		return interaction.editReply({ content: `Giveaway started! [Jump to message](${msg.url})` });
	}

	public async runEnd(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const giveaway = await getGiveawayByMessage(messageId);

		if (!giveaway) {
			return interaction.reply({ content: "Giveaway not found.", ephemeral: true });
		}
		if (giveaway.ended) {
			return interaction.reply({ content: "This giveaway has already ended.", ephemeral: true });
		}

		await this.resolveGiveaway(interaction, giveaway);
	}

	public async runReroll(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const giveaway = await getGiveawayByMessage(messageId);

		if (!giveaway || !giveaway.ended) {
			return interaction.reply({ content: "Giveaway not found or hasn't ended yet.", ephemeral: true });
		}

		const entries = giveaway.entries as string[];
		if (entries.length === 0) {
			return interaction.reply({ content: "No entries to reroll.", ephemeral: true });
		}

		const winners = this.pickWinners(entries, giveaway.winnerCount);
		await endGiveaway(messageId, winners);

		return interaction.reply({
			content: `🎉 Reroll! New winner${winners.length > 1 ? "s" : ""}: ${winners.map((w) => `<@${w}>`).join(", ")}`,
		});
	}

	private async resolveGiveaway(
		interaction: Subcommand.ChatInputCommandInteraction,
		giveaway: Awaited<ReturnType<typeof getGiveawayByMessage>>,
	) {
		if (!giveaway) return;
		const entries = giveaway.entries as string[];

		const winners = this.pickWinners(entries, giveaway.winnerCount);
		await endGiveaway(giveaway.messageId, winners);

		const channel = interaction.guild!.channels.cache.get(giveaway.channelId);
		if (channel && "send" in channel) {
			const winnerText = winners.length > 0
				? winners.map((w) => `<@${w}>`).join(", ")
				: "No valid entries";

			await (channel as TextChannel).send({
				content: `🎉 **Giveaway Ended!** Congratulations to ${winnerText}!\nPrize: **${giveaway.prize}**`,
			});

			// Disable entry button on original message
			const msg = await (channel as TextChannel).messages.fetch(giveaway.messageId).catch(() => null);
			if (msg) {
				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId("giveaway:enter")
						.setLabel("Giveaway Ended")
						.setStyle(ButtonStyle.Secondary)
						.setEmoji("🎉")
						.setDisabled(true),
				);
				await msg.edit({ components: [row] }).catch(() => null);
			}
		}

		if (interaction) {
			return interaction.reply({
				content: `Giveaway ended! Winner${winners.length > 1 ? "s" : ""}: ${winners.map((w) => `<@${w}>`).join(", ") || "None"}`,
				ephemeral: true,
			});
		}
	}

	private pickWinners(entries: string[], count: number): string[] {
		const shuffled = [...entries].sort(() => Math.random() - 0.5);
		return shuffled.slice(0, Math.min(count, shuffled.length));
	}
}
