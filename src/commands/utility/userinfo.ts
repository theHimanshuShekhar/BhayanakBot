import { Command } from "@sapphire/framework";
import { EmbedBuilder, GuildMember } from "discord.js";

export class UserInfoCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Display information about a user (account age, join date, roles).",
				examples: ["/userinfo", "/userinfo user:@someone"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("userinfo")
				.setDescription("Display information about a user")
				.addUserOption((opt) => opt.setName("user").setDescription("User to look up").setRequired(false)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user") ?? interaction.user;
		const member = interaction.guild!.members.cache.get(target.id) ??
			await interaction.guild!.members.fetch(target.id).catch(() => null);

		const embed = new EmbedBuilder()
			.setTitle(`${target.tag}`)
			.setThumbnail(target.displayAvatarURL({ size: 256 }))
			.setColor(member?.displayColor ?? 0x5865f2)
			.addFields(
				{ name: "Account Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
				{ name: "ID", value: target.id, inline: true },
				{ name: "Bot", value: target.bot ? "Yes" : "No", inline: true },
			)
			.setFooter({ text: `ID: ${target.id}` });

		if (member) {
			if (member.joinedTimestamp) {
				embed.addFields({ name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
			}
			if (member.nickname) {
				embed.addFields({ name: "Nickname", value: member.nickname, inline: true });
			}
			const roles = member.roles.cache
				.filter((r) => r.id !== interaction.guild!.roles.everyone.id)
				.sort((a, b) => b.position - a.position)
				.map((r) => `<@&${r.id}>`)
				.slice(0, 10);
			if (roles.length > 0) {
				embed.addFields({ name: `Roles (${member.roles.cache.size - 1})`, value: roles.join(" ") });
			}
		}

		return interaction.reply({ embeds: [embed] });
	}
}
