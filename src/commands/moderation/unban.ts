import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { createCase } from "../../db/queries/modCases.js";
import { logToChannel } from "./warn.js";

export class UnbanCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, name: "unban", description: "Unban a user", preconditions: ["GuildOnly", "IsModerator"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("unban")
				.setDescription("Unban a user by their ID")
				.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
				.addStringOption((opt) => opt.setName("user-id").setDescription("User ID to unban").setRequired(true))
				.addStringOption((opt) => opt.setName("reason").setDescription("Reason for the unban")),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const userId = interaction.options.getString("user-id", true);
		const reason = interaction.options.getString("reason") ?? "No reason provided";

		try {
			const ban = await interaction.guild!.bans.fetch(userId).catch(() => null);
			if (!ban) return interaction.editReply("❌ This user is not banned.");
			await interaction.guild!.members.unban(userId, reason);

			const modCase = await createCase({
				guildId: interaction.guildId!,
				userId,
				moderatorId: interaction.user.id,
				type: "unban",
				reason,
			});

			const embed = new EmbedBuilder()
				.setColor(0x57f287)
				.setTitle(`✅ Unban — Case #${modCase.caseNumber}`)
				.addFields(
					{ name: "User", value: `<@${userId}> (${ban.user.tag})`, inline: true },
					{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
					{ name: "Reason", value: reason },
				)
				.setTimestamp();

			await logToChannel(interaction, embed);
			return interaction.editReply({ embeds: [embed] });
		} catch {
			return interaction.editReply("❌ Failed to unban. Make sure the ID is valid.");
		}
	}
}
