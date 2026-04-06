import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
	isInJail,
	setCooldown,
	getCooldown,
	clearCooldown,
	getEquippedTool,
	getActivePet,
	addXpToProfile,
	checkAndAdvanceQuestProgress,
	type StatKey,
} from "../../db/queries/rpg.js";
import { rollOutcome, randomPay } from "../../lib/rpg/helpers/outcome.js";
import { applyJobRewards } from "../../lib/rpg/helpers/rewards.js";
import { getRemainingCooldown, formatDuration } from "../../lib/rpg/helpers/cooldown.js";
import { JOBS, getJob } from "../../lib/rpg/catalogs/jobs.js";
import { ITEMS } from "../../lib/rpg/catalogs/items.js";
import { generateFlavorText } from "../../lib/rpg/helpers/flavorText.js";

const JOB_CHOICES = Object.values(JOBS)
	.filter((j) => j.category !== "crime")
	.map((j) => ({ name: j.name, value: j.id }));

export class WorkCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("work")
				.setDescription("Do a job to earn coins")
				.addStringOption((opt) =>
					opt
						.setName("job")
						.setDescription("Which job to attempt")
						.setRequired(true)
						.addChoices(...JOB_CHOICES),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const jobId = interaction.options.getString("job", true);
		const job = getJob(jobId);
		if (!job) {
			return interaction.editReply({ content: "Unknown job." });
		}

		if (job.category === "crime") {
			return interaction.editReply({ content: "Use `/crime` for criminal activities." });
		}

		const { profile, stats } = await getOrCreateProfile(interaction.user.id);
		const activePet = await getActivePet(interaction.user.id);

		if (isInJail(profile)) {
			const until = Math.floor(profile.jailUntil!.getTime() / 1000);
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle("🔒 You're in jail!")
						.setDescription(`You can't work from behind bars. Released <t:${until}:R>.`),
				],
			});
		}

		const remaining = await getRemainingCooldown(interaction.user.id, `job:${jobId}`);
		if (remaining > 0) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setDescription(`⏳ **${job.name}** is on cooldown. Ready in **${formatDuration(remaining)}**.`),
				],
			});
		}

		const statEntries = Object.entries(job.statRequirements) as [StatKey, number][];
		const meetsStatGate = statEntries.every(([stat, required]) => (stats[stat] as number) >= required);
		const equippedTool = await getEquippedTool(interaction.user.id);
		const hasToolBypass = job.toolBypass !== undefined && equippedTool === job.toolBypass;

		if (!meetsStatGate && !hasToolBypass && statEntries.length > 0) {
			const reqs = statEntries
				.map(([stat, req]) => `${stat.charAt(0).toUpperCase() + stat.slice(1)} ${req} (you: ${stats[stat as StatKey]})`)
				.join(", ");
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle(`❌ Can't work as ${job.name}`)
						.setDescription(`Requirements not met: **${reqs}**\nTrain your stats with \`/train\`.`),
				],
			});
		}

		const charmCooldown = await getCooldown(interaction.user.id, "buff:lucky_charm");
		const hasCharm = charmCooldown !== null && charmCooldown > new Date();
		if (hasCharm) {
			await clearCooldown(interaction.user.id, "buff:lucky_charm");
		}

		const relevantStats = statEntries.map(([stat]) => stat);

		const { success, finalChance } = rollOutcome({
			baseSuccessChance: job.baseSuccessChance,
			relevantStats,
			stats,
			toolBypass: !meetsStatGate && hasToolBypass,
			consumableBonus: hasCharm ? 0.1 : 0,
		});

		await setCooldown(interaction.user.id, `job:${jobId}`, job.cooldownMs);

		if (success) {
			const pay = randomPay(job.payRange[0], job.payRange[1]);
			const { droppedItems } = await applyJobRewards(interaction.user.id, pay, job.dropTable);
			const { newLevel, leveledUp } = await addXpToProfile(interaction.user.id, job.xpReward);

			const dropText =
				droppedItems.length > 0
					? "\n\n**Item drop:** " + droppedItems.map((id) => ITEMS[id]?.name ?? id).join(", ")
					: "";
			const levelText = leveledUp ? `\n\n⭐ **Level up! You're now level ${newLevel}!**` : "";
			const charmText = hasCharm ? "\n🍀 *Lucky Charm bonus applied!*" : "";

			const flavor = await generateFlavorText({
				action: job.name,
				success: true,
				pay,
				playerName: interaction.user.displayName,
				playerLevel: profile.level,
				petName: activePet?.nickname ?? activePet?.petId,
				petType: activePet?.petId,
				activeItem: hasCharm ? "lucky charm" : undefined,
			});

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle(`✅ ${job.name} — Success!`)
						.setDescription(
							`*${flavor}*\n\nYou earned **${pay.toLocaleString()} coins** and **${job.xpReward} XP**.${dropText}${levelText}${charmText}`,
						)
						.setFooter({ text: `Success chance was ${Math.round(finalChance * 100)}% • Next available in ${formatDuration(job.cooldownMs)}` }),
				],
			});

			await checkAndAdvanceQuestProgress({
				userId: interaction.user.id,
				guildId: interaction.guildId!,
				objectiveType: "work",
				objectiveJob: jobId,
				onComplete: async (quest) => {
					await interaction.followUp({
						ephemeral: true,
						content: `✅ Quest complete: **${quest.title}** — you earned **${quest.rewardCoins.toLocaleString()} coins** and **${quest.rewardXp} XP**!`,
					});
				},
			});
			return;
		} else {
			const flavor = await generateFlavorText({
				action: job.name,
				success: false,
				playerName: interaction.user.displayName,
				playerLevel: profile.level,
				petName: activePet?.nickname ?? activePet?.petId,
				petType: activePet?.petId,
			});

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle(`❌ ${job.name} — Failed`)
						.setDescription(`*${flavor}*\n\nBetter luck next time. No coins lost.`)
						.setFooter({ text: `Success chance was ${Math.round(finalChance * 100)}% • Next available in ${formatDuration(job.cooldownMs)}` }),
				],
			});
		}
	}
}
