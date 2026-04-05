import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

export class EditSnipeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("editsnipe").setDescription("Show the last edited message in this channel (before edit)"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const client = this.container.client as import("../../lib/BhayanakClient.js").BhayanakClient;
		const cached = client.editSnipeCache.get(interaction.channelId);

		if (!cached) {
			return interaction.reply({ content: "No recently edited messages found.", ephemeral: true });
		}

		const embed = new EmbedBuilder()
			.setAuthor({ name: cached.authorTag, iconURL: cached.authorAvatar ?? undefined })
			.addFields(
				{ name: "Before", value: cached.oldContent || "*[no text content]*" },
				{ name: "After", value: cached.newContent || "*[no text content]*" },
			)
			.setColor(0xfee75c)
			.setFooter({ text: "Edited" })
			.setTimestamp(cached.editedAt);

		return interaction.reply({ embeds: [embed] });
	}
}
