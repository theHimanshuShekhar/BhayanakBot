import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import {
	ChannelType,
	PermissionFlagsBits,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	TextChannel,
	MessageFlags,
} from "discord.js";
import { getTicketByChannel, createTicket, claimTicket, closeTicket, getUserOpenTickets } from "../db/queries/tickets.js";
import { getOrCreateSettings } from "../db/queries/guildSettings.js";

export class TicketButtonsHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("ticket:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const action = interaction.customId.split(":")[1];

		switch (action) {
			case "open_panel":
				return this.handleOpenPanel(interaction);
			case "close":
				return this.handleClose(interaction);
			case "claim":
				return this.handleClaim(interaction);
		}
	}

	private async handleOpenPanel(interaction: ButtonInteraction) {
		const guild = interaction.guild!;
		const settings = await getOrCreateSettings(guild.id);

		const openTickets = await getUserOpenTickets(interaction.user.id, guild.id);
		if (openTickets.length > 0) {
			return interaction.reply({
				content: `You already have an open ticket: <#${openTickets[0].channelId}>`,
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const channelName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "");

		const channelOptions: Parameters<typeof guild.channels.create>[0] = {
			name: channelName,
			type: ChannelType.GuildText,
			...(settings.ticketCategoryId ? { parent: settings.ticketCategoryId } : {}),
			permissionOverwrites: [
				{ id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
				{
					id: interaction.user.id,
					allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
				},
				{
					id: guild.members.me!.id,
					allow: [
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.ManageChannels,
						PermissionFlagsBits.ReadMessageHistory,
					],
				},
				...(settings.ticketSupportRoleId
					? [{ id: settings.ticketSupportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]
					: []),
			],
		};

		const channel = await guild.channels.create(channelOptions) as TextChannel;
		await createTicket({ channelId: channel.id, userId: interaction.user.id, guildId: guild.id });

		const embed = new EmbedBuilder()
			.setTitle("Support Ticket")
			.setDescription(`Hello ${interaction.user}! A staff member will be with you shortly.`)
			.setColor(0x5865f2)
			.setTimestamp();

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
			new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Secondary).setEmoji("✋"),
		);

		await channel.send({
			content: `${interaction.user}${settings.ticketSupportRoleId ? ` <@&${settings.ticketSupportRoleId}>` : ""}`,
			embeds: [embed],
			components: [row],
		});

		return interaction.editReply({ content: `Your ticket has been created: ${channel}` });
	}

	private async handleClose(interaction: ButtonInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket || ticket.status === "closed") {
			return interaction.reply({ content: "No open ticket found in this channel.", flags: MessageFlags.Ephemeral });
		}

		await interaction.deferReply();

		let transcriptUrl: string | undefined;
		try {
			const { createTranscript } = await import("discord-html-transcripts");
			const attachment = await createTranscript(interaction.channel as TextChannel, {
				returnType: "attachment",
				filename: `ticket-${ticket.id}.html`,
			} as any);

			const settings = await getOrCreateSettings(interaction.guildId!);
			if (settings.logChannelId) {
				const logChannel = interaction.guild!.channels.cache.get(settings.logChannelId);
				if (logChannel && "send" in logChannel) {
					const msg = await (logChannel as TextChannel).send({
						content: `Ticket #${ticket.id} transcript — opened by <@${ticket.userId}>`,
						files: [attachment as any],
					});
					transcriptUrl = msg.attachments.first()?.url;
				}
			}
		} catch {
			// transcript failed — close anyway
		}

		await closeTicket(interaction.channelId, interaction.user.id, transcriptUrl);
		await interaction.editReply({ content: "Ticket closed. Deleting channel in 5 seconds..." });

		setTimeout(() => {
			interaction.channel?.delete().catch(() => null);
		}, 5000);
	}

	private async handleClaim(interaction: ButtonInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket || ticket.status === "closed") {
			return interaction.reply({ content: "No open ticket found in this channel.", flags: MessageFlags.Ephemeral });
		}

		if (ticket.claimedBy) {
			return interaction.reply({ content: `Already claimed by <@${ticket.claimedBy}>.`, flags: MessageFlags.Ephemeral });
		}

		await claimTicket(interaction.channelId, interaction.user.id);
		return interaction.reply({ content: `${interaction.user} has claimed this ticket.` });
	}
}
