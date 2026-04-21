import { Subcommand } from "@sapphire/plugin-subcommands";
import {
	ChannelType,
	OverwriteType,
	PermissionFlagsBits,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	TextChannel,
	MessageFlags,
} from "discord.js";
import {
	createTicket,
	getTicketByChannel,
	claimTicket,
	closeTicket,
	getUserOpenTickets,
} from "../../db/queries/tickets.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";

export class TicketCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "open", chatInputRun: "runOpen" },
				{ name: "close", chatInputRun: "runClose" },
				{ name: "claim", chatInputRun: "runClaim" },
				{ name: "add", chatInputRun: "runAdd" },
				{ name: "remove", chatInputRun: "runRemove" },
				{ name: "transcript", chatInputRun: "runTranscript" },
			],
			preconditions: ["GuildOnly"],
			help: {
				summary: "Open, close, claim, or manage support tickets.",
				examples: ["/ticket open topic:billing issue", "/ticket close", "/ticket claim", "/ticket add user:@helper"],
				subcommands: {
					open: { summary: "Open a new support ticket.", examples: ["/ticket open topic:billing issue"] },
					close: { summary: "Close the current ticket channel.", examples: ["/ticket close"] },
					claim: { summary: "Claim the ticket as your own to handle.", examples: ["/ticket claim"] },
					add: { summary: "Add a user to the ticket channel.", examples: ["/ticket add user:@helper"] },
					remove: { summary: "Remove a user from the ticket channel.", examples: ["/ticket remove user:@helper"] },
					transcript: { summary: "Export a text transcript of the ticket.", examples: ["/ticket transcript"] },
				},
			},
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("ticket")
				.setDescription("Ticket management")
				.addSubcommand((sub) =>
					sub
						.setName("open")
						.setDescription("Open a new support ticket")
						.addStringOption((opt) =>
							opt.setName("subject").setDescription("Brief subject for your ticket").setRequired(false),
						),
				)
				.addSubcommand((sub) => sub.setName("close").setDescription("Close this ticket"))
				.addSubcommand((sub) => sub.setName("claim").setDescription("Claim this ticket as yours"))
				.addSubcommand((sub) =>
					sub
						.setName("add")
						.setDescription("Add a user to this ticket")
						.addUserOption((opt) => opt.setName("user").setDescription("User to add").setRequired(true)),
				)
				.addSubcommand((sub) =>
					sub
						.setName("remove")
						.setDescription("Remove a user from this ticket")
						.addUserOption((opt) => opt.setName("user").setDescription("User to remove").setRequired(true)),
				)
				.addSubcommand((sub) => sub.setName("transcript").setDescription("Save and send the ticket transcript")),
		);
	}

	public async runOpen(interaction: Subcommand.ChatInputCommandInteraction) {
		const guild = interaction.guild!;
		const subject = interaction.options.getString("subject") ?? undefined;
		const settings = await getOrCreateSettings(guild.id);

		// Limit 1 open ticket per user
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
		await createTicket({ channelId: channel.id, userId: interaction.user.id, guildId: guild.id, subject });

		const embed = new EmbedBuilder()
			.setTitle("Support Ticket")
			.setDescription(
				[
					`Hello ${interaction.user}! A staff member will be with you shortly.`,
					subject ? `\n**Subject:** ${subject}` : "",
				].join(""),
			)
			.setColor(0x5865f2)
			.setTimestamp();

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
			new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Secondary).setEmoji("✋"),
		);

		await channel.send({ content: `${interaction.user} ${settings.ticketSupportRoleId ? `<@&${settings.ticketSupportRoleId}>` : ""}`, embeds: [embed], components: [row] });

		return interaction.editReply({ content: `Your ticket has been created: ${channel}` });
	}

	public async runClose(interaction: Subcommand.ChatInputCommandInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket || ticket.status === "closed") {
			return interaction.reply({ content: "This command must be run inside an open ticket channel.", flags: MessageFlags.Ephemeral });
		}

		await interaction.deferReply();

		let transcriptUrl: string | undefined;
		try {
			const { createTranscript } = await import("discord-html-transcripts");
			const attachment = await createTranscript(interaction.channel as TextChannel, {
				returnType: "attachment",
				filename: `ticket-${ticket.id}.html`,
			} as any);

			// Save transcript to log channel if configured
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
			// Transcript generation failed — proceed with close anyway
		}

		await closeTicket(interaction.channelId, interaction.user.id, transcriptUrl);
		await interaction.editReply({ content: "Ticket closed. Deleting channel in 5 seconds..." });

		setTimeout(() => {
			interaction.channel?.delete().catch(() => null);
		}, 5000);
	}

	public async runClaim(interaction: Subcommand.ChatInputCommandInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket || ticket.status === "closed") {
			return interaction.reply({ content: "This command must be run inside an open ticket channel.", flags: MessageFlags.Ephemeral });
		}

		if (ticket.claimedBy) {
			return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.`, flags: MessageFlags.Ephemeral });
		}

		await claimTicket(interaction.channelId, interaction.user.id);
		return interaction.reply({ content: `${interaction.user} has claimed this ticket.` });
	}

	public async runAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket || ticket.status === "closed") {
			return interaction.reply({ content: "This command must be run inside an open ticket channel.", flags: MessageFlags.Ephemeral });
		}

		const target = interaction.options.getUser("user", true);
		await (interaction.channel as TextChannel).permissionOverwrites.create(target.id, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		return interaction.reply({ content: `Added ${target} to the ticket.` });
	}

	public async runRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket || ticket.status === "closed") {
			return interaction.reply({ content: "This command must be run inside an open ticket channel.", flags: MessageFlags.Ephemeral });
		}

		const target = interaction.options.getUser("user", true);
		if (target.id === ticket.userId) {
			return interaction.reply({ content: "Cannot remove the ticket owner.", flags: MessageFlags.Ephemeral });
		}

		await (interaction.channel as TextChannel).permissionOverwrites.delete(target.id);
		return interaction.reply({ content: `Removed ${target} from the ticket.` });
	}

	public async runTranscript(interaction: Subcommand.ChatInputCommandInteraction) {
		const ticket = await getTicketByChannel(interaction.channelId);
		if (!ticket) {
			return interaction.reply({ content: "This command must be run inside a ticket channel.", flags: MessageFlags.Ephemeral });
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			const { createTranscript } = await import("discord-html-transcripts");
			const attachment = await createTranscript(interaction.channel as TextChannel, {
				returnType: "attachment",
				filename: `ticket-${ticket.id}.html`,
			} as any);

			return interaction.editReply({
				content: "Transcript generated:",
				files: [attachment as any],
			});
		} catch {
			return interaction.editReply({ content: "Failed to generate transcript." });
		}
	}
}
