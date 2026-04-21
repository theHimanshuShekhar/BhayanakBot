import { Command } from "@sapphire/framework";
import { EmbedBuilder, TextChannel , MessageFlags } from "discord.js";
import { createSuggestion } from "../../db/queries/suggestions.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";

export class SuggestCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Submit a suggestion to the server's suggestions channel.",
				examples: ['/suggest idea:"Add a movie night bot"'],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("suggest")
				.setDescription("Submit a suggestion for the server")
				.addStringOption((opt) =>
					opt.setName("idea").setDescription("Your suggestion").setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const idea = interaction.options.getString("idea", true);
		const settings = await getOrCreateSettings(interaction.guildId!);

		if (!settings.logChannelId) {
			return interaction.reply({ content: "Suggestions channel is not configured. Ask an admin to set it up.", flags: MessageFlags.Ephemeral });
		}

		// For suggestions we reuse logChannelId as a fallback; ideally you'd add a `suggestionsChannelId`
		// but we'll use the log channel since that's what's available in the schema
		const suggChannel = interaction.guild!.channels.cache.get(settings.logChannelId);
		if (!suggChannel || !("send" in suggChannel)) {
			return interaction.reply({ content: "Suggestions channel not found.", flags: MessageFlags.Ephemeral });
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const embed = new EmbedBuilder()
			.setTitle("💡 New Suggestion")
			.setDescription(idea)
			.setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
			.setColor(0x5865f2)
			.setTimestamp()
			.setFooter({ text: "Status: Pending" });

		const msg = await (suggChannel as TextChannel).send({ embeds: [embed] });
		await msg.react("👍").catch(() => null);
		await msg.react("👎").catch(() => null);

		await createSuggestion({
			messageId: msg.id,
			channelId: msg.channelId,
			userId: interaction.user.id,
			guildId: interaction.guildId!,
			content: idea,
		});

		return interaction.editReply({ content: "Your suggestion has been submitted!" });
	}
}
