import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { getLeaderboard } from "../../db/queries/users.js";

export class LeaderboardCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "View the top XP earners in this server.",
				examples: ["/leaderboard", "/leaderboard page:2"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("leaderboard")
				.setDescription("View the top XP earners in this server")
				.addIntegerOption((opt) => opt.setName("page").setDescription("Page number").setMinValue(1).setRequired(false)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const page = interaction.options.getInteger("page") ?? 1;
		const pageSize = 10;
		const guildId = interaction.guildId!;

		const offset = (page - 1) * pageSize;
		const entries = await getLeaderboard(guildId, pageSize, offset);

		if (entries.length === 0) {
			return interaction.reply({ content: "No users found on this page.", flags: MessageFlags.Ephemeral });
		}

		const medals = ["🥇", "🥈", "🥉"];
		const lines = entries.map((u, i) => {
			const rank = offset + i + 1;
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
