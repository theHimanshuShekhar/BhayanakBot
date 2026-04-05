import { Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder , MessageFlags } from "discord.js";
import { getOrCreateProfile, tryDebitCoins, updateCoins, addItem, removeItem } from "../../db/queries/rpg.js";
import { ITEMS, getBuyableItems, getItem } from "../../lib/rpg/catalogs/items.js";

const ITEMS_PER_PAGE = 5;

const SELL_PRICE: Record<string, number> = {
	rare_gem: 2000,
	old_coin: 500,
};

function getSellPrice(itemId: string): number | null {
	if (SELL_PRICE[itemId] !== undefined) return SELL_PRICE[itemId];
	const item = getItem(itemId);
	if (!item || item.price === 0) return null;
	return Math.floor(item.price * 0.5);
}

export function buildShopPage(page: number): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder>; totalPages: number } {
	const allItems = getBuyableItems();
	const totalPages = Math.max(1, Math.ceil(allItems.length / ITEMS_PER_PAGE));
	const safePage = Math.max(0, Math.min(page, totalPages - 1));
	const slice = allItems.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

	const embed = new EmbedBuilder()
		.setTitle("🛒 Item Shop")
		.setColor(0xfee75c)
		.setDescription(
			slice
				.map((item) => `**${item.name}** — ${item.price.toLocaleString()} coins\n*${item.description}*`)
				.join("\n\n"),
		)
		.setFooter({ text: `Page ${safePage + 1}/${totalPages} • Use /shop buy <item> to purchase` });

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`rpgshop:prev:${safePage}`)
			.setLabel("◀ Previous")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(safePage === 0),
		new ButtonBuilder()
			.setCustomId(`rpgshop:next:${safePage}`)
			.setLabel("Next ▶")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(safePage >= totalPages - 1),
	);

	return { embed, row, totalPages };
}

export class ShopCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("shop")
				.setDescription("Browse, buy, or sell items")
				.addSubcommand((sub) => sub.setName("browse").setDescription("Browse available items"))
				.addSubcommand((sub) =>
					sub
						.setName("buy")
						.setDescription("Buy an item from the shop")
						.addStringOption((opt) =>
							opt
								.setName("item")
								.setDescription("Item to buy")
								.setRequired(true)
								.addChoices(...getBuyableItems().map((i) => ({ name: i.name, value: i.id }))),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("sell")
						.setDescription("Sell an item from your inventory")
						.addStringOption((opt) =>
							opt.setName("item").setDescription("Item ID to sell").setRequired(true),
						)
						.addIntegerOption((opt) =>
							opt.setName("quantity").setDescription("How many to sell (default 1)").setMinValue(1).setRequired(false),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand(true);

		if (sub === "browse") {
			const { embed, row } = buildShopPage(0);
			return interaction.reply({ embeds: [embed], components: [row] });
		}

		if (sub === "buy") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const itemId = interaction.options.getString("item", true);
			const item = getItem(itemId);
			if (!item || item.price === 0) {
				return interaction.editReply({ content: "That item isn't available in the shop." });
			}

			const remaining = await tryDebitCoins(interaction.user.id, item.price);
			if (remaining === null) {
				const { profile } = await getOrCreateProfile(interaction.user.id);
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(`❌ You need **${item.price.toLocaleString()} coins** but only have **${profile.coins.toLocaleString()}**.`),
					],
				});
			}

			await addItem(interaction.user.id, itemId);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setDescription(`✅ Bought **${item.name}** for **${item.price.toLocaleString()} coins**.`),
				],
			});
		}

		if (sub === "sell") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const itemId = interaction.options.getString("item", true);
			const quantity = interaction.options.getInteger("quantity") ?? 1;

			const sellPrice = getSellPrice(itemId);
			if (sellPrice === null) {
				return interaction.editReply({ content: "That item can't be sold." });
			}

			const item = ITEMS[itemId];
			const removed = await removeItem(interaction.user.id, itemId, quantity);
			if (!removed) {
				return interaction.editReply({ content: "You don't have enough of that item." });
			}

			const total = sellPrice * quantity;
			await updateCoins(interaction.user.id, total);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setDescription(
							`✅ Sold **${quantity}x ${item?.name ?? itemId}** for **${total.toLocaleString()} coins**.`,
						),
				],
			});
		}
	}
}
