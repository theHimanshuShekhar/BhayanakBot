import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

export class AvatarCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("avatar")
				.setDescription("Show a user's avatar")
				.addUserOption((opt) => opt.setName("user").setDescription("User to show avatar for").setRequired(false)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user") ?? interaction.user;
		const member = interaction.guild?.members.cache.get(target.id);

		const globalAvatar = target.displayAvatarURL({ size: 1024 });
		const guildAvatar = member?.displayAvatarURL({ size: 1024 });

		const embed = new EmbedBuilder()
			.setTitle(`${target.displayName}'s Avatar`)
			.setImage(guildAvatar ?? globalAvatar)
			.setColor(0x5865f2);

		if (guildAvatar && guildAvatar !== globalAvatar) {
			embed.setDescription(`[Global Avatar](${globalAvatar})`);
		}

		return interaction.reply({ embeds: [embed] });
	}
}
