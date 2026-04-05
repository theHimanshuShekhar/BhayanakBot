import { Command } from "@sapphire/framework";
import { EmbedBuilder , MessageFlags } from "discord.js";

export class SnipeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("snipe").setDescription("Show the last deleted message in this channel"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const client = this.container.client as import("../../lib/BhayanakClient.js").BhayanakClient;
		const cached = client.snipeCache.get(interaction.channelId);

		if (!cached) {
			return interaction.reply({ content: "No recently deleted messages found.", flags: MessageFlags.Ephemeral });
		}

		const embed = new EmbedBuilder()
			.setAuthor({ name: cached.authorTag, iconURL: cached.authorAvatar ?? undefined })
			.setDescription(cached.content || "*[no text content]*")
			.setColor(0xed4245)
			.setFooter({ text: "Deleted" })
			.setTimestamp(cached.deletedAt);

		return interaction.reply({ embeds: [embed] });
	}
}
