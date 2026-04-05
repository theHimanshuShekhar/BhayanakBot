import { Command } from "@sapphire/framework";
import { EmbedBuilder , MessageFlags } from "discord.js";
import {
	getOrCreateProfile,
	getOwnedProperties,
	addProperty,
	updateLastCollectedAt,
	updateCoins,
	tryDebitCoins,
} from "../../db/queries/rpg.js";
import { getBuyableProperties, getProperty } from "../../lib/rpg/catalogs/properties.js";

const PROPERTY_CHOICES = getBuyableProperties().map((p) => ({
	name: `${p.emoji} ${p.name} (${p.price.toLocaleString()} coins)`,
	value: p.id,
}));

export class PropertyCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("property")
				.setDescription("Buy and manage properties for passive income")
				.addSubcommand((sub) => sub.setName("view").setDescription("View your properties"))
				.addSubcommand((sub) =>
					sub
						.setName("buy")
						.setDescription("Purchase a property")
						.addStringOption((opt) =>
							opt
								.setName("property")
								.setDescription("Property to buy")
								.setRequired(true)
								.addChoices(...PROPERTY_CHOICES),
						),
				)
				.addSubcommand((sub) =>
					sub.setName("collect").setDescription("Collect accumulated income from your properties"),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand(true);

		if (sub === "view") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const owned = await getOwnedProperties(interaction.user.id);

			if (owned.length === 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x5865f2)
							.setDescription("You don't own any properties. Use `/property buy` to purchase one."),
					],
				});
			}

			const lines = owned.map((op) => {
				const prop = getProperty(op.propertyId);
				const hoursHeld = (Date.now() - op.lastCollectedAt.getTime()) / (1000 * 60 * 60);
				const pending =
					prop && prop.incomePerHour > 0 ? Math.floor(hoursHeld * prop.incomePerHour) : 0;
				const incomeText =
					prop && prop.incomePerHour > 0
						? ` • **${prop.incomePerHour}/hr** *(pending: **${pending.toLocaleString()} coins**)*`
						: "";
				const storageText = prop?.storageBonus ? ` • +${prop.storageBonus} storage` : "";
				return `${prop?.emoji ?? "🏠"} **${prop?.name ?? op.propertyId}**${incomeText}${storageText}`;
			});

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle("🏠 Your Properties")
						.setColor(0x5865f2)
						.setDescription(lines.join("\n\n")),
				],
			});
		}

		if (sub === "buy") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const propertyId = interaction.options.getString("property", true);
			const prop = getProperty(propertyId);

			if (!prop) {
				return interaction.editReply({ content: "Unknown property." });
			}

			const owned = await getOwnedProperties(interaction.user.id);

			if (owned.some((op) => op.propertyId === propertyId)) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setDescription(`You already own a **${prop.name}**. You can only own one of each property.`),
					],
				});
			}

			const remaining = await tryDebitCoins(interaction.user.id, prop.price);
			if (remaining === null) {
				const { profile } = await getOrCreateProfile(interaction.user.id);
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(
								`❌ You need **${prop.price.toLocaleString()} coins** to buy ${prop.emoji} **${prop.name}**, but you only have **${profile.coins.toLocaleString()}**.`,
							),
					],
				});
			}

			await addProperty(interaction.user.id, propertyId);

			const details: string[] = [];
			if (prop.incomePerHour > 0) details.push(`💰 **${prop.incomePerHour} coins/hr** passive income`);
			if (prop.storageBonus > 0) details.push(`📦 **+${prop.storageBonus}** inventory slots`);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle(`${prop.emoji} Purchased ${prop.name}!`)
						.setDescription(
							`*${prop.description}*\n\nPaid **${prop.price.toLocaleString()} coins**.\n\n${details.join("\n") || "*Cosmetic property.*"}`,
						)
						.setFooter({ text: `Category: ${prop.category}` }),
				],
			});
		}

		if (sub === "collect") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const owned = await getOwnedProperties(interaction.user.id);
			const earners = owned.filter((op) => {
				const prop = getProperty(op.propertyId);
				return prop && prop.incomePerHour > 0;
			});

			if (earners.length === 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setDescription(
								"None of your properties generate income. Buy a business or the Mansion via `/property buy`.",
							),
					],
				});
			}

			let total = 0;
			const lines: string[] = [];

			for (const op of earners) {
				const prop = getProperty(op.propertyId)!;
				const hoursHeld = (Date.now() - op.lastCollectedAt.getTime()) / (1000 * 60 * 60);
				const earned = Math.floor(hoursHeld * prop.incomePerHour);
				total += earned;
				lines.push(
					`${prop.emoji} **${prop.name}** — **${earned.toLocaleString()} coins** *(${prop.incomePerHour}/hr × ${hoursHeld.toFixed(1)}h)*`,
				);
				await updateLastCollectedAt(op.id);
			}

			if (total === 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setDescription("No income to collect yet. Check back in a bit."),
					],
				});
			}

			await updateCoins(interaction.user.id, total);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle("💰 Income Collected!")
						.setDescription(lines.join("\n") + `\n\n**Total: +${total.toLocaleString()} coins**`),
				],
			});
		}
	}
}
