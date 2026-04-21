import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder , MessageFlags } from "discord.js";
import { getUserCases } from "../../db/queries/modCases.js";

const typeEmoji: Record<string, string> = {
	warn: "⚠️", mute: "🔇", unmute: "🔊", kick: "👢", ban: "🔨", unban: "✅", tempban: "⏱️",
};

export class HistoryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "history",
			description: "View moderation history for a user",
			preconditions: ["GuildOnly", "IsModerator"],
			help: {
				summary: "View moderation history for a user.",
				examples: ["/history user:@someone"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("history")
				.setDescription("View moderation history for a user")
				.addUserOption((opt) => opt.setName("user").setDescription("User to view history for").setRequired(true)),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const target = interaction.options.getUser("user", true);
		const cases = await getUserCases(interaction.guildId!, target.id);

		if (cases.length === 0) {
			return interaction.editReply(`✅ **${target.tag}** has no moderation history.`);
		}

		const embed = new EmbedBuilder()
			.setTitle(`📋 Moderation History — ${target.tag}`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x5865f2)
			.setDescription(
				cases
					.slice(0, 20)
					.map((c) => `${typeEmoji[c.type] ?? "❓"} **Case #${c.caseNumber}** (${c.type}) — ${c.reason ?? "No reason"} — <t:${Math.floor(c.createdAt.getTime() / 1000)}:d>`)
					.join("\n"),
			)
			.setFooter({ text: `Total: ${cases.length} cases` })
			.setTimestamp();

		return interaction.editReply({ embeds: [embed] });
	}
}
