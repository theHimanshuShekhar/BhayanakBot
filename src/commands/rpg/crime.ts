import { Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { db } from "../../lib/database.js";
import { rpgProfiles } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import {
	getOrCreateProfile,
	isInJail,
	setCooldown,
	getCooldown,
	clearCooldown,
	addXpToProfile,
	updateCoins,
	type StatKey,
} from "../../db/queries/rpg.js";
import { rollOutcome, randomPay } from "../../lib/rpg/helpers/outcome.js";
import { applyJobRewards } from "../../lib/rpg/helpers/rewards.js";
import { getRemainingCooldown, formatDuration } from "../../lib/rpg/helpers/cooldown.js";
import { JOBS, getJob } from "../../lib/rpg/catalogs/jobs.js";
import { ITEMS } from "../../lib/rpg/catalogs/items.js";
import { generateFlavorText } from "../../lib/rpg/helpers/flavorText.js";

const CRIME_CHOICES = Object.values(JOBS)
	.filter((j) => j.category === "crime")
	.map((j) => ({ name: j.name, value: j.id }));

function buildJailRow(bailCost: number): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("rpgjail:bail")
			.setLabel(`Bail Out (${bailCost.toLocaleString()} coins)`)
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId("rpgjail:escape")
			.setLabel("Attempt Escape")
			.setStyle(ButtonStyle.Secondary),
	);
}

export class CrimeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("crime")
				.setDescription("Attempt a criminal activity")
				.addStringOption((opt) =>
					opt
						.setName("job")
						.setDescription("Which crime to attempt")
						.setRequired(true)
						.addChoices(...CRIME_CHOICES),
				)
				.addUserOption((opt) =>
					opt.setName("target").setDescription("Target player (required for rob_player)").setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const jobId = interaction.options.getString("job", true);
		const job = getJob(jobId);
		if (!job || job.category !== "crime") {
			return interaction.editReply({ content: "Unknown crime." });
		}

		const target = interaction.options.getUser("target");

		if (jobId === "rob_player") {
			if (!target) {
				return interaction.editReply({ content: "❌ You must specify a target player for **rob_player**." });
			}
			if (target.id === interaction.user.id) {
				return interaction.editReply({ content: "❌ You can't rob yourself." });
			}
			if (target.bot) {
				return interaction.editReply({ content: "❌ Bots carry no coins." });
			}
		}

		const { profile, stats } = await getOrCreateProfile(interaction.user.id);

		if (isInJail(profile)) {
			const until = Math.floor(profile.jailUntil!.getTime() / 1000);
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle("🔒 You're in jail!")
						.setDescription(`You can't commit crimes from behind bars. Released <t:${until}:R>.`),
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

		if (!meetsStatGate && statEntries.length > 0) {
			const reqs = statEntries
				.map(([stat, req]) => `${stat.charAt(0).toUpperCase() + stat.slice(1)} ${req} (you: ${stats[stat as StatKey]})`)
				.join(", ");
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle(`❌ Can't attempt ${job.name}`)
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
			consumableBonus: hasCharm ? 0.1 : 0,
		});

		await setCooldown(interaction.user.id, `job:${jobId}`, job.cooldownMs);

		if (success) {
			let pay: number;
			let dropText = "";

			if (jobId === "rob_player" && target) {
				const { profile: victimProfile } = await getOrCreateProfile(target.id);
				pay = Math.min(randomPay(job.payRange[0], job.payRange[1]), victimProfile.coins);
				await updateCoins(target.id, -pay);
				await updateCoins(interaction.user.id, pay);
			} else {
				pay = randomPay(job.payRange[0], job.payRange[1]);
				const { droppedItems } = await applyJobRewards(interaction.user.id, pay, job.dropTable);
				dropText =
					droppedItems.length > 0
						? "\n\n**Item drop:** " + droppedItems.map((id) => ITEMS[id]?.name ?? id).join(", ")
						: "";
			}

			const { newLevel, leveledUp } = await addXpToProfile(interaction.user.id, job.xpReward);
			const levelText = leveledUp ? `\n\n⭐ **Level up! You're now level ${newLevel}!**` : "";
			const charmText = hasCharm ? "\n🍀 *Lucky Charm bonus applied!*" : "";

			const flavor = await generateFlavorText({
				action: job.name,
				success: true,
				pay,
				playerName: interaction.user.displayName,
				details: target ? `target: ${target.displayName}` : undefined,
			});

			return interaction.editReply({
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
		} else {
			const jailMs = job.jailSentenceMs ?? 5 * 60 * 1000;
			const jailUntil = new Date(Date.now() + jailMs);
			const bailCost = Math.floor(job.payRange[0] * 0.5);

			await db
				.update(rpgProfiles)
				.set({ jailUntil, jailBailCost: bailCost })
				.where(eq(rpgProfiles.userId, interaction.user.id));

			const until = Math.floor(jailUntil.getTime() / 1000);

			let compensationText = "";
			if (jobId === "rob_player" && target) {
				const attempted = randomPay(job.payRange[0], job.payRange[1]);
				const compensation = Math.min(Math.floor(attempted * 0.2), Math.max(0, profile.coins));
				if (compensation > 0) {
					await updateCoins(interaction.user.id, -compensation);
					await updateCoins(target.id, compensation);
					compensationText = `\n${target.displayName} received **${compensation.toLocaleString()} coins** in compensation.`;
				}
			}

			const charmText = hasCharm ? "\n🍀 *Lucky Charm was consumed but couldn't save you.*" : "";

			const flavor = await generateFlavorText({
				action: job.name,
				success: false,
				playerName: interaction.user.displayName,
				details: target ? `target: ${target.displayName}` : undefined,
			});

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle(`🚨 ${job.name} — Caught!`)
						.setDescription(
							`*${flavor}*\n\nYou've been thrown in jail until <t:${until}:R>.${compensationText}${charmText}`,
						)
						.setFooter({ text: `Success chance was ${Math.round(finalChance * 100)}% • Bail: ${bailCost.toLocaleString()} coins` }),
				],
				components: [buildJailRow(bailCost)],
			});
		}
	}
}
