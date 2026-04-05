import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmbedBuilder , MessageFlags } from "discord.js";
import { getSuggestion, updateSuggestionStatus } from "../../db/queries/suggestions.js";

export class SuggestionCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "approve", chatInputRun: "runApprove" },
				{ name: "deny", chatInputRun: "runDeny" },
			],
			preconditions: ["GuildOnly", "IsModerator"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("suggestion")
				.setDescription("Manage suggestions")
				.addSubcommand((sub) =>
					sub
						.setName("approve")
						.setDescription("Approve a suggestion")
						.addIntegerOption((opt) => opt.setName("id").setDescription("Suggestion ID").setRequired(true))
						.addStringOption((opt) =>
							opt.setName("response").setDescription("Optional response message").setRequired(false),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("deny")
						.setDescription("Deny a suggestion")
						.addIntegerOption((opt) => opt.setName("id").setDescription("Suggestion ID").setRequired(true))
						.addStringOption((opt) =>
							opt.setName("reason").setDescription("Reason for denial").setRequired(false),
						),
				),
		);
	}

	public async runApprove(interaction: Subcommand.ChatInputCommandInteraction) {
		const id = interaction.options.getInteger("id", true);
		const response = interaction.options.getString("response") ?? undefined;

		const suggestion = await getSuggestion(id, interaction.guildId!);
		if (!suggestion) {
			return interaction.reply({ content: `Suggestion #${id} not found.`, flags: MessageFlags.Ephemeral });
		}

		await updateSuggestionStatus(id, "approved", response);

		// Update the original embed
		const channel = interaction.guild!.channels.cache.get(suggestion.channelId);
		if (channel && "messages" in channel) {
			const msg = await (channel as any).messages.fetch(suggestion.messageId).catch(() => null);
			if (msg) {
				const embed = new EmbedBuilder()
					.setTitle("💡 Suggestion — Approved ✅")
					.setDescription(suggestion.content)
					.setAuthor({ name: `Suggested by <@${suggestion.userId}>` })
					.setColor(0x57f287)
					.setTimestamp()
					.setFooter({ text: `Reviewed by ${interaction.user.tag}` });
				if (response) embed.addFields({ name: "Response", value: response });
				await msg.edit({ embeds: [embed] }).catch(() => null);
			}
		}

		return interaction.reply({ content: `Approved suggestion #${id}.`, flags: MessageFlags.Ephemeral });
	}

	public async runDeny(interaction: Subcommand.ChatInputCommandInteraction) {
		const id = interaction.options.getInteger("id", true);
		const reason = interaction.options.getString("reason") ?? undefined;

		const suggestion = await getSuggestion(id, interaction.guildId!);
		if (!suggestion) {
			return interaction.reply({ content: `Suggestion #${id} not found.`, flags: MessageFlags.Ephemeral });
		}

		await updateSuggestionStatus(id, "denied", reason);

		const channel = interaction.guild!.channels.cache.get(suggestion.channelId);
		if (channel && "messages" in channel) {
			const msg = await (channel as any).messages.fetch(suggestion.messageId).catch(() => null);
			if (msg) {
				const embed = new EmbedBuilder()
					.setTitle("💡 Suggestion — Denied ❌")
					.setDescription(suggestion.content)
					.setAuthor({ name: `Suggested by <@${suggestion.userId}>` })
					.setColor(0xed4245)
					.setTimestamp()
					.setFooter({ text: `Reviewed by ${interaction.user.tag}` });
				if (reason) embed.addFields({ name: "Reason", value: reason });
				await msg.edit({ embeds: [embed] }).catch(() => null);
			}
		}

		return interaction.reply({ content: `Denied suggestion #${id}.`, flags: MessageFlags.Ephemeral });
	}
}
