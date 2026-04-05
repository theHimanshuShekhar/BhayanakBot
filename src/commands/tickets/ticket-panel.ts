import { Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel , MessageFlags } from "discord.js";

export class TicketPanelCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly", "IsAdmin"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("ticket-panel")
				.setDescription("Post a ticket creation panel in a channel (Admin)")
				.addChannelOption((opt) =>
					opt.setName("channel").setDescription("Channel to post the panel in").setRequired(true),
				)
				.addStringOption((opt) =>
					opt.setName("title").setDescription("Panel title").setRequired(false),
				)
				.addStringOption((opt) =>
					opt.setName("description").setDescription("Panel description").setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const channel = interaction.options.getChannel("channel", true);
		const title = interaction.options.getString("title") ?? "Support Tickets";
		const description =
			interaction.options.getString("description") ??
			"Click the button below to open a support ticket. A staff member will assist you shortly.";

		if (!("send" in channel)) {
			return interaction.reply({ content: "That channel is not a text channel.", flags: MessageFlags.Ephemeral });
		}

		const embed = new EmbedBuilder()
			.setTitle(title)
			.setDescription(description)
			.setColor(0x5865f2)
			.setFooter({ text: "Only one ticket can be open at a time" });

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("ticket:open_panel")
				.setLabel("Open a Ticket")
				.setStyle(ButtonStyle.Primary)
				.setEmoji("🎫"),
		);

		await (channel as TextChannel).send({ embeds: [embed], components: [row] });
		return interaction.reply({ content: `Ticket panel posted in ${channel}.`, flags: MessageFlags.Ephemeral });
	}
}
