import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateUser, getLeaderboard } from "../../db/queries/users.js";

export class RankCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "View your XP rank or another member's.",
				examples: ["/rank", "/rank user:@someone"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("rank")
				.setDescription("View your XP rank or another member's")
				.addUserOption((opt) => opt.setName("user").setDescription("User to check").setRequired(false)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user") ?? interaction.user;
		const guildId = interaction.guildId!;

		const [userData, leaderboard] = await Promise.all([
			getOrCreateUser(target.id, guildId),
			getLeaderboard(guildId, 1000),
		]);

		const rank = leaderboard.findIndex((u) => u.userId === target.id) + 1;
		const xpForNextLevel = Math.pow((userData.level + 1) / 0.1, 2);
		const xpForCurrentLevel = Math.pow(userData.level / 0.1, 2);
		const progress = userData.xp - xpForCurrentLevel;
		const needed = xpForNextLevel - xpForCurrentLevel;
		const barFilled = Math.round((progress / needed) * 20);
		const bar = "█".repeat(barFilled) + "░".repeat(20 - barFilled);

		const embed = new EmbedBuilder()
			.setTitle(`${target.displayName}'s Rank`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x5865f2)
			.addFields(
				{ name: "Rank", value: rank > 0 ? `#${rank}` : "Unranked", inline: true },
				{ name: "Level", value: `${userData.level}`, inline: true },
				{ name: "XP", value: `${userData.xp.toLocaleString()}`, inline: true },
				{ name: "Messages", value: `${userData.totalMessages.toLocaleString()}`, inline: true },
				{ name: `Progress to Level ${userData.level + 1}`, value: `\`${bar}\` ${progress}/${Math.round(needed)}` },
			)
			.setFooter({ text: `Total XP: ${userData.xp}` });

		return interaction.reply({ embeds: [embed] });
	}
}
