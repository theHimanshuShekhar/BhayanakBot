import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { REASON_MAX_LENGTH, recordAndReport, targetBlocker } from "../../lib/moderation.js";

export class KickCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "kick",
			description: "Kick a member",
			preconditions: ["GuildOnly", { name: "IsModerator", context: { permission: PermissionFlagsBits.KickMembers } }],
			help: {
				summary: "Kick a member from the server.",
				examples: ['/kick user:@someone reason:"inappropriate behavior"'],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("kick")
				.setDescription("Kick a member from the server")
				.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("Member to kick").setRequired(true))
				.addStringOption((opt) =>
					opt.setName("reason").setDescription("Reason for the kick").setMaxLength(REASON_MAX_LENGTH),
				),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const targetUser = interaction.options.getUser("user", true);
		const target = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		const reason = interaction.options.getString("reason") ?? "No reason provided";

		if (!target) return interaction.editReply("❌ Member not found in this server.");

		const blocker = targetBlocker(interaction, target, "kick", target.kickable);
		if (blocker) return interaction.editReply(blocker);

		await target
			.send(`You have been **kicked** from **${interaction.guild!.name}**. Reason: ${reason}`)
			.catch(() => null);
		try {
			await target.kick(reason);
		} catch {
			return interaction.editReply("❌ I don't have permission to kick this member.");
		}

		return recordAndReport(interaction, {
			caseData: {
				guildId: interaction.guildId!,
				userId: target.id,
				moderatorId: interaction.user.id,
				type: "kick",
				reason,
			},
			notRecorded: `✅ Kicked <@${target.id}>, but the case was not recorded.`,
			buildEmbed: (caseNumber) =>
				new EmbedBuilder()
					.setColor(0xffa500)
					.setTitle(`👢 Kick — Case #${caseNumber}`)
					.addFields(
						{ name: "User", value: `<@${target.id}> (${target.user.tag})`, inline: true },
						{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
						{ name: "Reason", value: reason },
					)
					.setTimestamp(),
		});
	}
}
