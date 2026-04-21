import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from "discord.js";
import { createCase } from "../../db/queries/modCases.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { logToChannel } from "./warn.js";
import ms from "ms";

export class MuteCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "mute",
			description: "Mute a member",
			preconditions: ["GuildOnly", "IsModerator"],
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
				.addStringOption((opt) => opt.setName("duration").setDescription("Duration (e.g. 10m, 1h, 1d)").setRequired(true))
				.addStringOption((opt) => opt.setName("reason").setDescription("Reason for the mute")),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const targetUser = interaction.options.getUser("user", true);
		const target = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
		const durationStr = interaction.options.getString("duration", true);
		const reason = interaction.options.getString("reason") ?? "No reason provided";

		if (!target) return interaction.editReply("❌ Member not found.");

		const duration = ms(durationStr as Parameters<typeof ms>[0]);
		if (!duration) return interaction.editReply("❌ Invalid duration. Use e.g. `10m`, `1h`, `1d`.");

		const myHighest = interaction.guild!.members.me!.roles.highest.position;
		const modHighest = (interaction.member as GuildMember).roles.highest.position;
		const targetHighest = target.roles.highest.position;
		if (targetHighest >= myHighest) {
			return interaction.editReply("❌ I cannot mute a member with an equal or higher role than me.");
		}
		if (targetHighest >= modHighest) {
			return interaction.editReply("❌ You cannot mute a member with an equal or higher role than you.");
		}

		const settings = await getOrCreateSettings(interaction.guildId!);
		if (!settings.mutedRoleId) return interaction.editReply("❌ No muted role configured. Use `/config set muted-role` first.");

		const mutedRole = interaction.guild!.roles.cache.get(settings.mutedRoleId);
		if (!mutedRole) return interaction.editReply("❌ Muted role not found.");

		try {
			await target.roles.add(mutedRole, reason);
		} catch {
			return interaction.editReply("❌ I don't have permission to mute this member.");
		}

		const expiresAt = new Date(Date.now() + duration);
		const modCase = await createCase({
			guildId: interaction.guildId!,
			userId: target.id,
			moderatorId: interaction.user.id,
			type: "mute",
			reason,
			duration,
			expiresAt,
		});

		const embed = new EmbedBuilder()
			.setColor(0xffa500)
			.setTitle(`🔇 Mute — Case #${modCase.caseNumber}`)
			.addFields(
				{ name: "User", value: `<@${target.id}> (${target.user.tag ?? target.id})`, inline: true },
				{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
				{ name: "Duration", value: durationStr, inline: true },
				{ name: "Reason", value: reason },
				{ name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` },
			)
			.setTimestamp();

		await logToChannel(interaction, embed);
		return interaction.editReply({ embeds: [embed] });
	}
}
