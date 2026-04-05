import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from "discord.js";
import { createCase } from "../../db/queries/modCases.js";
import { logToChannel } from "./warn.js";
import ms from "ms";

export class BanCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, name: "ban", description: "Ban a member", preconditions: ["GuildOnly", "IsModerator"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("ban")
				.setDescription("Ban a member from the server")
				.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("Member to ban").setRequired(true))
				.addStringOption((opt) => opt.setName("reason").setDescription("Reason for the ban"))
				.addStringOption((opt) =>
					opt.setName("duration").setDescription("Duration for a temp ban (e.g. 7d, 24h, 30m)"),
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
			duration = ms(durationStr as Parameters<typeof ms>[0]) ?? null;
			if (!duration) return interaction.editReply("❌ Invalid duration format. Use e.g. `7d`, `24h`, `30m`.");
			expiresAt = new Date(Date.now() + duration);
		}

		const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		if (targetMember) {
			const myHighest = interaction.guild!.members.me!.roles.highest.position;
			const modHighest = (interaction.member as GuildMember).roles.highest.position;
			const targetHighest = targetMember.roles.highest.position;
			if (targetHighest >= myHighest) {
				return interaction.editReply("❌ I cannot ban a member with an equal or higher role than me.");
			}
			if (targetHighest >= modHighest) {
				return interaction.editReply("❌ You cannot ban a member with an equal or higher role than you.");
			}
		}

		try {
			await targetUser.send(
				`You have been **${durationStr ? `temporarily banned` : "banned"}** from **${interaction.guild!.name}**. Reason: ${reason}${durationStr ? `\nExpires: ${expiresAt!.toUTCString()}` : ""}`,
			).catch(() => null);
			await interaction.guild!.members.ban(targetUser, { reason });
		} catch {
			return interaction.editReply("❌ I don't have permission to ban this user.");
		}

		const modCase = await createCase({
			guildId: interaction.guildId!,
			userId: targetUser.id,
			moderatorId: interaction.user.id,
			type: durationStr ? "tempban" : "ban",
			reason,
			duration,
			expiresAt,
		});

		const embed = new EmbedBuilder()
			.setColor(0xed4245)
			.setTitle(`🔨 ${durationStr ? "Temp Ban" : "Ban"} — Case #${modCase.caseNumber}`)
			.addFields(
				{ name: "User", value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
				{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
				{ name: "Reason", value: reason },
				...(expiresAt ? [{ name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` }] : []),
			)
			.setTimestamp();

		await logToChannel(interaction, embed);
		return interaction.editReply({ embeds: [embed] });
	}
}
