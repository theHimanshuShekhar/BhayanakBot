import { Command } from "@sapphire/framework";
import { EmbedBuilder , MessageFlags } from "discord.js";
import {
	getOrCreateProfile,
	getTrainingCooldownDate,
	setTrainingCooldown,
	tryDebitCoins,
	updateStat,
	type StatKey,
} from "../../db/queries/rpg.js";
import { formatDuration } from "../../lib/rpg/helpers/cooldown.js";

const TRAINING_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const STAT_CAP = 100;

const STAT_CHOICES: { name: string; value: StatKey }[] = [
	{ name: "Strength", value: "strength" },
	{ name: "Intelligence", value: "intelligence" },
	{ name: "Agility", value: "agility" },
	{ name: "Charisma", value: "charisma" },
	{ name: "Luck", value: "luck" },
];

const STAT_EMOJI: Record<StatKey, string> = {
	strength: "⚔️",
	intelligence: "🧠",
	agility: "💨",
	charisma: "🗣️",
	luck: "🍀",
};

export class TrainCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("train")
				.setDescription("Train one of your RPG stats")
				.addStringOption((opt) =>
					opt
						.setName("stat")
						.setDescription("Which stat to train")
						.setRequired(true)
						.addChoices(...STAT_CHOICES),
				)
				.addBooleanOption((opt) =>
					opt.setName("pay").setDescription("Pay coins to skip the cooldown").setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const stat = interaction.options.getString("stat", true) as StatKey;
		const pay = interaction.options.getBoolean("pay") ?? false;

		const { profile, stats } = await getOrCreateProfile(interaction.user.id);
		const currentValue = stats[stat] as number;

		if (currentValue >= STAT_CAP) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setDescription(
							`${STAT_EMOJI[stat]} **${stat.charAt(0).toUpperCase() + stat.slice(1)}** is already maxed at ${STAT_CAP}!`,
						),
				],
			});
		}

		const gainAmount = Math.random() < 0.5 ? 1 : 2;
		const newValue = Math.min(STAT_CAP, currentValue + gainAmount);

		if (pay) {
			const cost = Math.floor(currentValue * 15);
			const remaining = await tryDebitCoins(interaction.user.id, cost);
			if (remaining === null) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(
								`❌ You need **${cost.toLocaleString()} coins** to pay-train ${stat}, but you only have **${profile.coins.toLocaleString()}**.`,
							),
					],
				});
			}
			await updateStat(interaction.user.id, stat, newValue);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle(`${STAT_EMOJI[stat]} Pay Training — ${stat.charAt(0).toUpperCase() + stat.slice(1)}`)
						.addFields(
							{ name: "Stat Gain", value: `+${gainAmount} → **${newValue}/100**`, inline: true },
							{ name: "Cost", value: `${cost.toLocaleString()} coins`, inline: true },
						),
				],
			});
		}

		// Free training — check cooldown
		const lastTrained = getTrainingCooldownDate(stats, stat);
		if (lastTrained) {
			const remaining = lastTrained.getTime() + TRAINING_COOLDOWN_MS - Date.now();
			if (remaining > 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setDescription(
								`⏳ ${STAT_EMOJI[stat]} **${stat.charAt(0).toUpperCase() + stat.slice(1)}** is still recovering. Ready in **${formatDuration(remaining)}**.`,
							),
					],
				});
			}
		}

		await updateStat(interaction.user.id, stat, newValue);
		await setTrainingCooldown(interaction.user.id, stat, new Date());

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle(`${STAT_EMOJI[stat]} Training — ${stat.charAt(0).toUpperCase() + stat.slice(1)}`)
					.addFields(
						{ name: "Stat Gain", value: `+${gainAmount} → **${newValue}/100**`, inline: true },
						{ name: "Next Free Train", value: `in ${formatDuration(TRAINING_COOLDOWN_MS)}`, inline: true },
					),
			],
		});
	}
}
