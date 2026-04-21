import { Subcommand } from "@sapphire/plugin-subcommands";
import { type ChatInputCommandInteraction, EmbedBuilder , MessageFlags } from "discord.js";
import { getCase, updateCaseReason } from "../../db/queries/modCases.js";

const typeEmoji: Record<string, string> = {
	warn: "⚠️", mute: "🔇", unmute: "🔊", kick: "👢", ban: "🔨", unban: "✅", tempban: "⏱️",
};

export class CaseCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			name: "case",
			description: "View or edit a moderation case",
			preconditions: ["GuildOnly", "IsModerator"],
			subcommands: [
				{ name: "view", chatInputRun: "chatInputView" },
				{ name: "edit", chatInputRun: "chatInputEdit" },
			],
			help: {
				summary: "View or edit a moderation case.",
				examples: ["/case view number:12", '/case edit number:12 reason:"updated context"'],
				subcommands: {
					view: { summary: "View a specific case by its number.", examples: ["/case view number:5"] },
					edit: { summary: "Edit the reason for an existing case.", examples: ['/case edit number:5 reason:"typo fix"'] },
				},
			},
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("case")
				.setDescription("View or edit a moderation case")
				.addSubcommand((sub) =>
					sub
						.setName("view")
						.setDescription("View a specific case")
						.addIntegerOption((opt) => opt.setName("number").setDescription("Case number").setRequired(true)),
				)
				.addSubcommand((sub) =>
					sub
						.setName("edit")
						.setDescription("Edit the reason for a case")
						.addIntegerOption((opt) => opt.setName("number").setDescription("Case number").setRequired(true))
						.addStringOption((opt) => opt.setName("reason").setDescription("New reason").setRequired(true)),
				),
		);
	}

	public async chatInputView(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const number = interaction.options.getInteger("number", true);
		const modCase = await getCase(interaction.guildId!, number);

		if (!modCase) return interaction.editReply(`❌ Case #${number} not found.`);

		const embed = new EmbedBuilder()
			.setTitle(`${typeEmoji[modCase.type] ?? "❓"} Case #${modCase.caseNumber} — ${modCase.type.toUpperCase()}`)
			.setColor(0x5865f2)
			.addFields(
				{ name: "User", value: `<@${modCase.userId}>`, inline: true },
				{ name: "Moderator", value: `<@${modCase.moderatorId}>`, inline: true },
				{ name: "Active", value: modCase.active ? "Yes" : "No", inline: true },
				{ name: "Reason", value: modCase.reason ?? "No reason provided" },
				...(modCase.expiresAt ? [{ name: "Expires", value: `<t:${Math.floor(modCase.expiresAt.getTime() / 1000)}:R>` }] : []),
			)
			.setTimestamp(modCase.createdAt);

		return interaction.editReply({ embeds: [embed] });
	}

	public async chatInputEdit(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const number = interaction.options.getInteger("number", true);
		const reason = interaction.options.getString("reason", true);

		const modCase = await getCase(interaction.guildId!, number);
		if (!modCase) return interaction.editReply(`❌ Case #${number} not found.`);

		await updateCaseReason(modCase.id, reason);
		return interaction.editReply(`✅ Case #${number} reason updated.`);
	}
}
