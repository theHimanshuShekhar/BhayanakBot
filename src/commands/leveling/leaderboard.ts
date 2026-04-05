import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getLeaderboard } from "../../db/queries/users.js";

export class LeaderboardCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("leaderboard")
				.setDescription("View the top XP earners in this server")
				.addIntegerOption((opt) =>
					opt.setName("page").setDescription("Page number").setMinValue(1).setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const page = interaction.options.getInteger("page") ?? 1;
		const pageSize = 10;
		const guildId = interaction.guildId!;

		const allUsers = await getLeaderboard(guildId, page * pageSize);
		const start = (page - 1) * pageSize;
		const entries = allUsers.slice(start, start + pageSize);

		if (entries.length === 0) {
			return interaction.reply({ content: "No users found on this page.", ephemeral: true });
		}

		const medals = ["🥇", "🥈", "🥉"];
		const lines = entries.map((u, i) => {
			const rank = start + i + 1;
			const medal = medals[rank - 1] ?? `**#${rank}**`;
			return `${medal} <@${u.userId}> — Level ${u.level} · ${u.xp.toLocaleString()} XP`;
		});

		const embed = new EmbedBuilder()
			.setTitle(`🏆 XP Leaderboard — Page ${page}`)
			.setDescription(lines.join("\n"))
			.setColor(0xffd700);

		return interaction.reply({ embeds: [embed] });
	}
}
