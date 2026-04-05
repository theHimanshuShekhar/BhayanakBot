import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

export class ServerInfoCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("serverinfo").setDescription("Display information about this server"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const guild = interaction.guild!;
		await guild.fetch();

		const channels = guild.channels.cache;
		const textCount = channels.filter((c) => c.type === 0).size;
		const voiceCount = channels.filter((c) => c.type === 2).size;

		const embed = new EmbedBuilder()
			.setTitle(guild.name)
			.setThumbnail(guild.iconURL())
			.setColor(0x5865f2)
			.addFields(
				{ name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
				{ name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
				{ name: "Members", value: `${guild.memberCount.toLocaleString()}`, inline: true },
				{ name: "Channels", value: `📝 ${textCount} · 🔊 ${voiceCount}`, inline: true },
				{ name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
				{ name: "Boosts", value: `Level ${guild.premiumTier} · ${guild.premiumSubscriptionCount ?? 0} boosts`, inline: true },
			)
			.setFooter({ text: `ID: ${guild.id}` });

		if (guild.banner) {
			embed.setImage(guild.bannerURL({ size: 1024 }));
		}

		return interaction.reply({ embeds: [embed] });
	}
}
