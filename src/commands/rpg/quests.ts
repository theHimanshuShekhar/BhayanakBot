import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { getTodayQuests, getUserQuestProgress } from "../../db/queries/rpg.js";

function progressBar(current: number, total: number, length = 8): string {
	const filled = Math.round((current / total) * length);
	return "█".repeat(filled) + "░".repeat(length - filled);
}

export class QuestsCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("quests").setDescription("View today's daily quests and your progress"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (!interaction.guildId) {
			return interaction.editReply({ content: "This command can only be used in a server." });
		}

		const today = new Date().toISOString().slice(0, 10);
		const quests = await getTodayQuests(interaction.guildId, today);

		if (quests.length === 0) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle("📋 Daily Quests")
						.setDescription("Quests are being generated — check back in a moment!"),
				],
			});
		}

		const questIds = quests.map((q) => q.id);
		const progressRows = await getUserQuestProgress(interaction.user.id, questIds);
		const progressMap = new Map(progressRows.map((p) => [p.questId, p]));

		const OBJECTIVE_EMOJI: Record<string, string> = {
			work: "💼",
			crime: "🦹",
			train: "🏋️",
		};

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle("📋 Daily Quests")
			.setDescription(`Today's quests for **${today}**. Complete them for bonus rewards!`);

		for (const quest of quests) {
			const userProgress = progressMap.get(quest.id);
			const current = userProgress?.progress ?? 0;
			const done = userProgress?.completedAt != null;
			const bar = progressBar(done ? quest.objectiveCount : current, quest.objectiveCount);
			const statusIcon = done ? "✅" : current > 0 ? "🔄" : "⬜";
			const jobLabel = quest.objectiveJob ? ` (${quest.objectiveJob.replace(/_/g, " ")})` : "";

			embed.addFields({
				name: `${statusIcon} ${OBJECTIVE_EMOJI[quest.objectiveType] ?? ""} ${quest.title}`,
				value: [
					quest.description,
					`\`${bar}\` ${done ? quest.objectiveCount : current}/${quest.objectiveCount}${jobLabel}`,
					`Reward: **${quest.rewardCoins.toLocaleString()} coins** · **${quest.rewardXp} XP**`,
				].join("\n"),
			});
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
