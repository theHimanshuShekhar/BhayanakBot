import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { DURATION_CAPS, parseDuration } from "../../lib/duration.js";
import { REASON_MAX_LENGTH, recordAndReport, targetBlocker } from "../../lib/moderation.js";

export class BanCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "ban",
			description: "Ban a member",
			preconditions: ["GuildOnly", "IsModerator"],
			help: {
				summary: "Ban a member from the server, optionally as a temporary ban.",
				examples: ['/ban user:@spammer reason:"raid"', "/ban user:@x duration:7d"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("ban")
				.setDescription("Ban a member from the server")
				.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("Member to ban").setRequired(true))
				.addStringOption((opt) =>
					opt.setName("reason").setDescription("Reason for the ban").setMaxLength(REASON_MAX_LENGTH),
				)
				.addStringOption((opt) =>
					opt.setName("duration").setDescription("Temp ban length, up to 1 year (e.g. 7d, 1w, 12h30m)"),
				),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const targetUser = interaction.options.getUser("user", true);
		const reason = interaction.options.getString("reason") ?? "No reason provided";
		const durationStr = interaction.options.getString("duration");

		let duration: number | null = null;
		let expiresAt: Date | null = null;

		if (durationStr) {
			const parsed = parseDuration(durationStr, DURATION_CAPS.tempban);
			if (!parsed.ok) return interaction.editReply(`❌ ${parsed.error}`);
			duration = parsed.ms;
			expiresAt = new Date(Date.now() + duration);
		}

		const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		if (targetMember) {
			const blocker = targetBlocker(interaction, targetMember, "ban", targetMember.bannable);
			if (blocker) return interaction.editReply(blocker);
		}

		await targetUser
			.send(
				`You have been **${durationStr ? `temporarily banned` : "banned"}** from **${interaction.guild!.name}**. Reason: ${reason}${durationStr ? `\nExpires: ${expiresAt!.toUTCString()}` : ""}`,
			)
			.catch(() => null);
		try {
			await interaction.guild!.members.ban(targetUser, { reason });
		} catch {
			return interaction.editReply("❌ I don't have permission to ban this user.");
		}

		return recordAndReport(interaction, {
			caseData: {
				guildId: interaction.guildId!,
				userId: targetUser.id,
				moderatorId: interaction.user.id,
				type: durationStr ? "tempban" : "ban",
				reason,
				duration,
				expiresAt,
			},
			notRecorded: `✅ Banned <@${targetUser.id}>, but the case was not recorded.`,
			buildEmbed: (caseNumber) =>
				new EmbedBuilder()
					.setColor(0xed4245)
					.setTitle(`🔨 ${durationStr ? "Temp Ban" : "Ban"} — Case #${caseNumber}`)
					.addFields(
						{ name: "User", value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
						{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
						{ name: "Reason", value: reason },
						...(expiresAt ? [{ name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` }] : []),
					)
					.setTimestamp(),
		});
	}
}
