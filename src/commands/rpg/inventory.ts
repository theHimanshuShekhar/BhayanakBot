import { Command } from "@sapphire/framework";
import { EmbedBuilder , MessageFlags } from "discord.js";
import {
	getOrCreateProfile,
	getInventory,
	removeItem,
	equipItem,
	clearCooldown,
	clearJail,
	setCooldown,
} from "../../db/queries/rpg.js";
import { db } from "../../lib/database.js";
import { rpgCooldowns } from "../../db/schema.js";
import { and, asc, eq, like } from "drizzle-orm";
import { getItem } from "../../lib/rpg/catalogs/items.js";

export class InventoryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			help: {
				summary: "View your item inventory and use or equip items.",
				examples: ["/inventory", "/inventory use:lucky_charm"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("inventory")
				.setDescription("View and manage your inventory")
				.addSubcommand((sub) => sub.setName("view").setDescription("View your inventory"))
				.addSubcommand((sub) =>
					sub
						.setName("use")
						.setDescription("Use a consumable item")
						.addStringOption((opt) =>
							opt.setName("item").setDescription("Item ID to use").setRequired(true),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("equip")
						.setDescription("Equip a tool item")
						.addStringOption((opt) =>
							opt.setName("item").setDescription("Item ID to equip").setRequired(true),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand(true);

		if (sub === "view") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const items = await getInventory(interaction.user.id);

			if (items.length === 0) {
				return interaction.editReply({
					embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("Your inventory is empty.")],
				});
			}

			const lines = items.map((inv) => {
				const item = getItem(inv.itemId);
				const equippedTag = inv.equippedSlot ? ` *(equipped)*` : "";
				return `**${item?.name ?? inv.itemId}** ×${inv.quantity}${equippedTag}\n*${item?.description ?? ""}*`;
			});

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle("🎒 Your Inventory")
						.setColor(0x5865f2)
						.setDescription(lines.join("\n\n")),
				],
			});
		}

		if (sub === "use") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const itemId = interaction.options.getString("item", true);
			const item = getItem(itemId);

			if (!item || item.slot !== "consumable") {
				return interaction.editReply({ content: "That item isn't a consumable." });
			}

			const removed = await removeItem(interaction.user.id, itemId, 1);
			if (!removed) {
				return interaction.editReply({ content: "You don't have that item." });
			}

			if (itemId === "energy_drink") {
				const soonest = await db.query.rpgCooldowns.findFirst({
					where: and(
						eq(rpgCooldowns.userId, interaction.user.id),
						like(rpgCooldowns.action, "job:%"),
					),
					orderBy: [asc(rpgCooldowns.expiresAt)],
				});
				if (soonest) {
					await clearCooldown(interaction.user.id, soonest.action);
					return interaction.editReply({
						embeds: [
							new EmbedBuilder()
								.setColor(0x57f287)
								.setDescription(`⚡ Used **Energy Drink** — cooldown on **${soonest.action.replace("job:", "")}** cleared!`),
						],
					});
				}
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setDescription("⚡ Used **Energy Drink** — no active job cooldowns to clear."),
					],
				});
			}

			if (itemId === "lucky_charm") {
				await setCooldown(interaction.user.id, "buff:lucky_charm", 24 * 60 * 60 * 1000);
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setDescription("🍀 Used **Lucky Charm** — your next action has +10% success chance. *(Effect active until your next `/work` or `/crime`)*"),
					],
				});
			}

			if (itemId === "jail_key") {
				const { profile } = await getOrCreateProfile(interaction.user.id);
				if (!profile.jailUntil || profile.jailUntil <= new Date()) {
					return interaction.editReply({ content: "You're not in jail! The key dissolved uselessly." });
				}
				await clearJail(interaction.user.id);
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setDescription("🗝️ Used **Jail Key** — you slipped out the back. You're free!"),
					],
				});
			}

			return interaction.editReply({ content: `Used **${item.name}**.` });
		}

		if (sub === "equip") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const itemId = interaction.options.getString("item", true);
			const item = getItem(itemId);

			if (!item || item.slot !== "tool") {
				return interaction.editReply({ content: "That item isn't a tool." });
			}

			const inv = await getInventory(interaction.user.id);
			const owned = inv.find((i) => i.itemId === itemId);
			if (!owned) {
				return interaction.editReply({ content: "You don't own that item." });
			}

			await equipItem(interaction.user.id, itemId, "tool");

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setDescription(`🔧 **${item.name}** equipped to your tool slot.`),
				],
			});
		}
	}
}
