import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { DURATION_CAPS, parseDuration } from "../../lib/duration.js";
import { REASON_MAX_LENGTH, recordAndReport, targetBlocker } from "../../lib/moderation.js";

export class MuteCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "mute",
			description: "Mute a member",
			preconditions: [
				"GuildOnly",
				{ name: "IsModerator", context: { permission: PermissionFlagsBits.ModerateMembers } },
			],
			help: {
				summary: "Mute a member for a duration.",
				examples: ['/mute user:@x duration:10m reason:"spam"', "/mute user:@y duration:1h"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("mute")
				.setDescription("Mute a member")
				.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("Member to mute").setRequired(true))
				.addStringOption((opt) =>
					opt.setName("duration").setDescription("Duration, up to 1 year (e.g. 10m, 1h30m, 2d, 1w)").setRequired(true),
				)
				.addStringOption((opt) =>
					opt.setName("reason").setDescription("Reason for the mute").setMaxLength(REASON_MAX_LENGTH),
				),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const targetUser = interaction.options.getUser("user", true);
		const target = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		const durationStr = interaction.options.getString("duration", true);
		const reason = interaction.options.getString("reason") ?? "No reason provided";

		const parsed = parseDuration(durationStr, DURATION_CAPS.mute);
		if (!parsed.ok) return interaction.editReply(`❌ ${parsed.error}`);
		const duration = parsed.ms;

		if (!target) return interaction.editReply("❌ Member not found.");

		const blocker = targetBlocker(interaction, target, "mute", target.manageable);
		if (blocker) return interaction.editReply(blocker);

		const settings = await getOrCreateSettings(interaction.guildId!);
		if (!settings.mutedRoleId)
			return interaction.editReply("❌ No muted role configured. Use `/config set muted-role` first.");

		const mutedRole = interaction.guild!.roles.cache.get(settings.mutedRoleId);
		if (!mutedRole) return interaction.editReply("❌ Muted role not found.");
		if (!mutedRole.editable)
			return interaction.editReply("❌ I cannot assign the muted role; it is above my highest role.");

		try {
			await target.roles.add(mutedRole, reason);
		} catch {
			return interaction.editReply("❌ I don't have permission to mute this member.");
		}

		const expiresAt = new Date(Date.now() + duration);
		return recordAndReport(interaction, {
			caseData: {
				guildId: interaction.guildId!,
				userId: target.id,
				moderatorId: interaction.user.id,
				type: "mute",
				reason,
				duration,
				expiresAt,
			},
			notRecorded: `✅ Muted <@${target.id}>, but the case was not recorded. The mute will not expire on its own.`,
			buildEmbed: (caseNumber) =>
				new EmbedBuilder()
					.setColor(0xffa500)
					.setTitle(`🔇 Mute — Case #${caseNumber}`)
					.addFields(
						{ name: "User", value: `<@${target.id}> (${target.user.tag ?? target.id})`, inline: true },
						{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
						{ name: "Duration", value: durationStr, inline: true },
						{ name: "Reason", value: reason },
						{ name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` },
					)
					.setTimestamp(),
		});
	}
}
