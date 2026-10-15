import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { REASON_MAX_LENGTH, recordAndReport } from "../../lib/moderation.js";

export class WarnCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "warn",
			description: "Warn a member",
			preconditions: ["GuildOnly", "IsModerator"],
			help: {
				summary: "Warn a member and log the case.",
				examples: ['/warn user:@x reason:"no caps in #general"'],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("warn")
				.setDescription("Warn a member")
				.addUserOption((opt) => opt.setName("user").setDescription("Member to warn").setRequired(true))
				.addStringOption((opt) =>
					opt
						.setName("reason")
						.setDescription("Reason for the warning")
						.setRequired(true)
						.setMaxLength(REASON_MAX_LENGTH),
				),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const target = interaction.options.getUser("user", true);
		const reason = interaction.options.getString("reason", true);

		return recordAndReport(interaction, {
			caseData: {
				guildId: interaction.guildId!,
				userId: target.id,
				moderatorId: interaction.user.id,
				type: "warn",
				reason,
			},
			notRecorded: "❌ The warning could not be recorded, so nothing was done. Try again.",
			buildEmbed: (caseNumber) =>
				new EmbedBuilder()
					.setColor(0xfee75c)
					.setTitle(`⚠️ Warning — Case #${caseNumber}`)
					.addFields(
						{ name: "User", value: `<@${target.id}> (${target.tag})`, inline: true },
						{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
						{ name: "Reason", value: reason },
					)
					.setTimestamp(),
		});
	}
}
