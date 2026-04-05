import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { createCase } from "../../db/queries/modCases.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { TextChannel } from "discord.js";

export class WarnCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, name: "warn", description: "Warn a member", preconditions: ["GuildOnly", "IsModerator"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("warn")
				.setDescription("Warn a member")
				.addUserOption((opt) => opt.setName("user").setDescription("Member to warn").setRequired(true))
				.addStringOption((opt) => opt.setName("reason").setDescription("Reason for the warning").setRequired(true)),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();
		const target = interaction.options.getUser("user", true);
		const reason = interaction.options.getString("reason", true);

		const modCase = await createCase({
			guildId: interaction.guildId!,
			userId: target.id,
			moderatorId: interaction.user.id,
			type: "warn",
			reason,
		});

		const embed = new EmbedBuilder()
			.setColor(0xfee75c)
			.setTitle(`⚠️ Warning — Case #${modCase.caseNumber}`)
			.addFields(
				{ name: "User", value: `<@${target.id}> (${target.tag})`, inline: true },
				{ name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
				{ name: "Reason", value: reason },
			)
			.setTimestamp();

		await logToChannel(interaction, embed);
		return interaction.editReply({ embeds: [embed] });
	}
}

export async function logToChannel(interaction: ChatInputCommandInteraction, embed: EmbedBuilder) {
	const settings = await getOrCreateSettings(interaction.guildId!);
	if (!settings.logChannelId) return;
	const logChannel = interaction.guild?.channels.cache.get(settings.logChannelId) as TextChannel | undefined;
	await logChannel?.send({ embeds: [embed] }).catch(() => null);
}
