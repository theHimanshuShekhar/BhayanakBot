import { Subcommand } from "@sapphire/plugin-subcommands";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	type TextChannel,
} from "discord.js";
import { createGiveaway, getGiveawayByMessage, rerollGiveaway } from "../../db/queries/giveaways.js";
import { notifyOnly } from "../../lib/allowedMentions.js";
import { DURATION_CAPS, parseDuration } from "../../lib/duration.js";
import { drawEligibleWinners, endAndAnnounceGiveaway, formatWinners } from "../../lib/giveaways.js";

export class GiveawayCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "start", chatInputRun: "runStart" },
				{ name: "end", chatInputRun: "runEnd" },
				{ name: "reroll", chatInputRun: "runReroll" },
			],
			preconditions: [
				"GuildOnly",
				{ name: "IsModerator", context: { permission: PermissionFlagsBits.ManageMessages } },
			],
			help: {
				summary: "Start, end, or reroll a giveaway.",
				examples: [
					"/giveaway start duration:1h prize:Nitro winners:2",
					"/giveaway end message-id:123456",
					"/giveaway reroll message-id:123456",
				],
				subcommands: {
					start: {
						summary: "Start a timed giveaway of up to 30 days in the current channel.",
						examples: ["/giveaway start duration:1h prize:Nitro winners:2"],
					},
					end: { summary: "End a giveaway early and draw winners.", examples: ["/giveaway end message-id:123456"] },
					reroll: {
						summary: "Reroll winners for an ended giveaway.",
						examples: ["/giveaway reroll message-id:123456"],
					},
				},
			},
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("giveaway")
				.setDescription("Giveaway management")
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addSubcommand((sub) =>
					sub
						.setName("start")
						.setDescription("Start a giveaway")
						.addStringOption((opt) =>
							opt
								.setName("duration")
								.setDescription("Duration, up to 30 days (e.g. 10m, 1h30m, 2d, 1w)")
								.setRequired(true),
						)
						.addStringOption((opt) =>
							opt.setName("prize").setDescription("What are you giving away?").setRequired(true),
						)
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

		const parsed = parseDuration(durationStr, DURATION_CAPS.giveaway);
		if (!parsed.ok) return interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });

		const endsAt = new Date(Date.now() + parsed.ms);

		const embed = new EmbedBuilder()
			.setTitle("🎉 Giveaway!")
			.setDescription(
				`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
			)
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

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
		const giveaway = await getGiveawayByMessage(interaction.guildId!, messageId);

		if (!giveaway) {
			return interaction.reply({ content: "Giveaway not found.", flags: MessageFlags.Ephemeral });
		}
		if (giveaway.ended) {
			return interaction.reply({ content: "This giveaway has already ended.", flags: MessageFlags.Ephemeral });
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const winners = await endAndAnnounceGiveaway(interaction.guild!, giveaway);
		if (!winners) return interaction.editReply({ content: "This giveaway has already ended." });

		return interaction.editReply({
			content: `Giveaway ended! ${winners.length > 0 ? `Winner${winners.length > 1 ? "s" : ""}: ${formatWinners(winners)}` : "No eligible entrants."}`,
		});
	}

	public async runReroll(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const giveaway = await getGiveawayByMessage(interaction.guildId!, messageId);

		if (!giveaway?.ended) {
			return interaction.reply({ content: "Giveaway not found or hasn't ended yet.", flags: MessageFlags.Ephemeral });
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		// Everyone who already won (the original draw and earlier rerolls) is excluded.
		const winners = await drawEligibleWinners(
			interaction.guild!,
			giveaway.entries,
			giveaway.winnerCount,
			giveaway.winners,
		);
		if (winners.length === 0) return interaction.editReply({ content: "No eligible entrants." });

		const rerolled = await rerollGiveaway(interaction.guildId!, messageId, giveaway.winners, winners);
		if (!rerolled) return interaction.editReply({ content: "This giveaway was just rerolled. Try again." });

		// A new message, not an edit of the deferred reply: Discord does not reliably notify mentions added by edits.
		const announcement = `🎉 Reroll! New winner${winners.length > 1 ? "s" : ""}: ${formatWinners(winners)}`;
		const channel = await interaction.guild!.channels.fetch(giveaway.channelId).catch((): null => null);
		const sent = channel?.isTextBased()
			? await channel.send({ content: announcement, allowedMentions: notifyOnly(winners) }).catch((): null => null)
			: null;
		if (!sent) {
			return interaction.editReply({ content: `Rerolled, but the announcement could not be posted. ${announcement}` });
		}

		return interaction.editReply({ content: `Rerolled! New winner${winners.length > 1 ? "s" : ""} announced.` });
	}
}
