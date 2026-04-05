import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { createCase } from "../../db/queries/modCases.js";
import { logToChannel } from "./warn.js";

export class KickCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, name: "kick", description: "Kick a member", preconditions: ["GuildOnly", "IsModerator"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("kick")
				.setDescription("Kick a member from the server")
				.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("Member to kick").setRequired(true))
				.addStringOption((opt) => opt.setName("reason").setDescription("Reason for the kick")),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const targetUser = interaction.options.getUser("user", true);
		const target = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		const reason = interaction.options.getString("reason") ?? "No reason provided";

		if (!target) return interaction.editReply("❌ Member not found in this server.");

		try {
			await target.send(`You have been **kicked** from **${interaction.guild!.name}**. Reason: ${reason}`).catch(() => null);
			await target.kick(reason);
		} catch {
			return interaction.editReply("❌ I don't have permission to kick this member.");
		}

		const modCase = await createCase({
			guildId: interaction.guildId!,
			userId: target.id,
			moderatorId: interaction.user.id,
			type: "kick",
			reason,
		});

		const embed = new EmbedBuilder()
			.setColor(0xffa500)
			.setTitle(`👢 Kick — Case #${modCase.caseNumber}`)
			.addFields(
				{ name: "User", value: `<@${target.id}> (${target.user.tag})`, inline: true },
				{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
				{ name: "Reason", value: reason },
			)
			.setTimestamp();

		await logToChannel(interaction, embed);
		return interaction.editReply({ embeds: [embed] });
	}
}
