import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { REASON_MAX_LENGTH, recordAndReport } from "../../lib/moderation.js";

export class UnmuteCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "unmute",
			description: "Unmute a member",
			preconditions: [
				"GuildOnly",
				{ name: "IsModerator", context: { permission: PermissionFlagsBits.ModerateMembers } },
			],
			help: {
				summary: "Unmute a previously muted member.",
				examples: ['/unmute user:@x reason:"served time"'],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("unmute")
				.setDescription("Unmute a member")
				.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("Member to unmute").setRequired(true))
				.addStringOption((opt) =>
					opt.setName("reason").setDescription("Reason for unmute").setMaxLength(REASON_MAX_LENGTH),
				),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const targetUser = interaction.options.getUser("user", true);
		const target = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		const reason = interaction.options.getString("reason") ?? "Manual unmute";

		if (!target) return interaction.editReply("❌ Member not found.");

		const settings = await getOrCreateSettings(interaction.guildId!);
		if (!settings.mutedRoleId) return interaction.editReply("❌ No muted role configured.");

		const mutedRole = interaction.guild!.roles.cache.get(settings.mutedRoleId);
		if (!mutedRole) return interaction.editReply("❌ Muted role not found.");

		if (!target.roles.cache.has(mutedRole.id)) return interaction.editReply("❌ This member is not muted.");

		if (!target.manageable || !mutedRole.editable) {
			return interaction.editReply("❌ I don't have permission to unmute this member.");
		}

		try {
			await target.roles.remove(mutedRole, reason);
		} catch {
			return interaction.editReply("❌ I don't have permission to unmute this member.");
		}

		return recordAndReport(interaction, {
			caseData: {
				guildId: interaction.guildId!,
				userId: target.id,
				moderatorId: interaction.user.id,
				type: "unmute",
				reason,
			},
			notRecorded: `✅ Unmuted <@${target.id}>, but the case was not recorded.`,
			buildEmbed: (caseNumber) =>
				new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle(`🔊 Unmute — Case #${caseNumber}`)
					.addFields(
						{ name: "User", value: `<@${target.id}> (${target.user.tag ?? target.id})`, inline: true },
						{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
						{ name: "Reason", value: reason },
					)
					.setTimestamp(),
		});
	}
}
