import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { REASON_MAX_LENGTH, recordAndReport } from "../../lib/moderation.js";

export class UnbanCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "unban",
			description: "Unban a user",
			preconditions: ["GuildOnly", { name: "IsModerator", context: { permission: PermissionFlagsBits.BanMembers } }],
			help: {
				summary: "Unban a user by their user ID.",
				examples: ['/unban user-id:123456789012345678 reason:"appeal accepted"'],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("unban")
				.setDescription("Unban a user by their ID")
				.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
				.addStringOption((opt) => opt.setName("user-id").setDescription("User ID to unban").setRequired(true))
				.addStringOption((opt) =>
					opt.setName("reason").setDescription("Reason for the unban").setMaxLength(REASON_MAX_LENGTH),
				),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const userId = interaction.options.getString("user-id", true);
		const reason = interaction.options.getString("reason") ?? "No reason provided";

		const ban = await interaction.guild!.bans.fetch(userId).catch(() => null);
		if (!ban) return interaction.editReply("❌ This user is not banned.");

		try {
			await interaction.guild!.members.unban(userId, reason);
		} catch {
			return interaction.editReply("❌ Failed to unban. Make sure the ID is valid.");
		}

		return recordAndReport(interaction, {
			caseData: { guildId: interaction.guildId!, userId, moderatorId: interaction.user.id, type: "unban", reason },
			notRecorded: `✅ Unbanned <@${userId}>, but the case was not recorded.`,
			buildEmbed: (caseNumber) =>
				new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle(`✅ Unban — Case #${caseNumber}`)
					.addFields(
						{ name: "User", value: `<@${userId}> (${ban.user.tag})`, inline: true },
						{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
						{ name: "Reason", value: reason },
					)
					.setTimestamp(),
		});
	}
}
