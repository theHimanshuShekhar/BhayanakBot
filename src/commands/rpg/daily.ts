import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateProfile, canClaimDaily, claimDaily } from "../../db/queries/rpg.js";
import { formatDuration } from "../../lib/rpg/helpers/cooldown.js";

export class DailyCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			help: {
				summary: "Claim your daily reward. Streak increases for consecutive days.",
				examples: ["/daily"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => builder.setName("daily").setDescription("Claim your daily reward"));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const { profile } = await getOrCreateProfile(interaction.user.id);
		const { canClaim, remainingMs } = canClaimDaily(profile.lastDailyAt);

		if (!canClaim) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle("⏳ Daily Reward on Cooldown")
						.setDescription(`You can claim your next daily reward in **${formatDuration(remainingMs)}**.\n\nCurrent streak: **${profile.dailyStreak}** 🔥`),
				],
			});
		}

		const { streak, reward, leveledUp } = await claimDaily(interaction.user.id);
		const streakEmoji = streak >= 30 ? "🔥🔥🔥" : streak >= 7 ? "🔥🔥" : "🔥";

		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle("✅ Daily Reward Claimed!")
			.setDescription(
				`You received **${reward.coins.toLocaleString()} coins** and **${reward.xp} XP**!\n\nStreak: **${streak}** ${streakEmoji}`,
			)
			.setFooter({ text: "Come back tomorrow to keep your streak alive!" });

		if (leveledUp) {
			embed.addFields({ name: "⭐ Level Up!", value: `You leveled up! Check your profile with \`/profile\`.` });
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
