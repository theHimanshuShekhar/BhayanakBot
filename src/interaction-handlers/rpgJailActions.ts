import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
	tryDebitCoins,
	clearJail,
	setCooldown,
	getCooldown,
} from "../db/queries/rpg.js";
import { rollOutcome } from "../lib/rpg/helpers/outcome.js";
import { db } from "../lib/database.js";
import { rpgProfiles } from "../db/schema.js";
import { eq } from "drizzle-orm";

function buildDisabledRow(bailCost: number): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("rpgjail:bail")
			.setLabel(`Bail Out (${bailCost.toLocaleString()} coins)`)
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId("rpgjail:escape")
			.setLabel("Escape (used)")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export class RpgJailActionsHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("rpgjail:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const action = interaction.customId.split(":")[1];
		const userId = interaction.user.id;
		const { profile, stats } = await getOrCreateProfile(userId);

		if (action === "bail") {
			const bailCost = profile.jailBailCost ?? 0;

			const remaining = await tryDebitCoins(userId, bailCost);
			if (remaining === null) {
				const { profile: fresh } = await getOrCreateProfile(userId);
				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(`❌ You need **${bailCost.toLocaleString()} coins** to bail out, but you only have **${fresh.coins.toLocaleString()}**.`),
					],
					ephemeral: true,
				});
				return;
			}

			await db
				.update(rpgProfiles)
				.set({ jailUntil: null, jailBailCost: 0 })
				.where(eq(rpgProfiles.userId, userId));

			await interaction.update({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle("🆓 Bailed Out")
						.setDescription(`You paid **${bailCost.toLocaleString()} coins** and walked free.`),
				],
				components: [],
			});
			await interaction.followUp({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setDescription("✅ Bail paid — you're free to go."),
				],
				ephemeral: true,
			});
			return;
		}

		if (action === "escape") {
			const escapeUsed = await getCooldown(userId, "jail:escape");
			if (escapeUsed !== null && escapeUsed > new Date()) {
				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription("❌ You already attempted to escape this sentence."),
					],
					ephemeral: true,
				});
				return;
			}

			if (!profile.jailUntil) {
				await interaction.reply({ content: "You're not in jail.", ephemeral: true });
				return;
			}

			const jailUntil = profile.jailUntil;
			const bailCost = profile.jailBailCost ?? 0;

			const { success } = rollOutcome({
				baseSuccessChance: 0.4,
				relevantStats: ["agility"],
				stats,
			});

			const remainingMs = Math.max(0, jailUntil.getTime() - Date.now());

			if (success) {
				await clearJail(userId);
				await setCooldown(userId, "jail:escape", remainingMs);
				await interaction.update({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🏃 Escaped!")
							.setDescription("You slipped past the guards. Don't get caught again."),
					],
					components: [],
				});
				await interaction.followUp({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setDescription("✅ You escaped! Lay low for a while."),
					],
					ephemeral: true,
				});
			} else {
				const newUntil = new Date(jailUntil.getTime() + remainingMs);
				await setCooldown(userId, "jail:escape", Math.max(0, newUntil.getTime() - Date.now()));
				await db
					.update(rpgProfiles)
					.set({ jailUntil: newUntil })
					.where(eq(rpgProfiles.userId, userId));

				const until = Math.floor(newUntil.getTime() / 1000);
				await interaction.update({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setTitle("🚨 Caught Escaping!")
							.setDescription(`The guards caught you. Your sentence was doubled. Released <t:${until}:R>.`),
					],
					components: [buildDisabledRow(bailCost)],
				});
				await interaction.followUp({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription("❌ Escape failed — sentence doubled. Bail is still an option."),
					],
					ephemeral: true,
				});
			}
		}
	}
}
