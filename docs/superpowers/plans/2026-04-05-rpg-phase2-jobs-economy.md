# RPG Module — Phase 2: Jobs & Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/work`, `/shop`, and `/inventory` commands so players can earn coins by doing jobs, buy/sell items from a shop, and manage their inventory.

**Architecture:** Each command is a self-contained Sapphire `Command` class in `src/commands/rpg/`. The `/work` command checks stat gates, applies the outcome formula from Phase 1, sets cooldowns, and grants rewards. The `/shop` command uses Discord select menus for item browsing, backed by a stateless interaction handler. The `/inventory` command reads and mutates the `rpgInventory` table via existing query helpers. All DB helpers needed already exist from Phase 1 — no schema changes.

**Tech Stack:** Sapphire Framework v5, Discord.js v14 (`EmbedBuilder`, `ActionRowBuilder`, `StringSelectMenuBuilder`, `ButtonBuilder`), Drizzle ORM 0.45, TypeScript ESM (`.js` imports).

**Spec:** `docs/superpowers/specs/2026-04-05-rpg-module-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/commands/rpg/work.ts` | `/work <job>` — stat gate check, outcome roll, cooldown, rewards |
| Create | `src/commands/rpg/shop.ts` | `/shop browse\|buy\|sell` — item shop |
| Create | `src/commands/rpg/inventory.ts` | `/inventory view\|use\|equip` — inventory management |
| Create | `src/interaction-handlers/rpgShopPage.ts` | Pagination buttons for `/shop browse` |

---

## Task 1: `/work` command

**Files:**
- Create: `src/commands/rpg/work.ts`

The `/work` command lets a player attempt a job. It:
1. Checks the player isn't in jail
2. Checks the job cooldown (`rpgCooldowns` via `getCooldown`)
3. Checks stat requirements — if not met, checks if the player has the `toolBypass` item equipped
4. Rolls outcome using `rollOutcome()` from Phase 1
5. On success: grants coins + XP (updates `rpgProfiles.xp` and `rpgProfiles.level`) + loot drops via `applyJobRewards()`
6. On failure: nothing lost for non-crime jobs (jail is Phase 3)
7. Sets cooldown via `setCooldown(userId, "job:<jobId>", job.cooldownMs)`

**Key types and imports available from Phase 1:**
- `getOrCreateProfile`, `updateCoins`, `isInJail`, `getCooldown`, `setCooldown`, `getEquippedTool` from `../../db/queries/rpg.js`
- `rollOutcome`, `randomPay` from `../../lib/rpg/helpers/outcome.js`
- `applyJobRewards` from `../../lib/rpg/helpers/rewards.js`
- `getRemainingCooldown`, `formatDuration` from `../../lib/rpg/helpers/cooldown.js`
- `JOBS`, `getJob` from `../../lib/rpg/catalogs/jobs.js`

**XP update:** Phase 1 added `xp` and `level` to `rpgProfiles` but no helper to increment XP. Add `addXpToProfile(userId, amount)` directly in `work.ts` using a raw `db.update` — it's used only here, so no need to add it to `rpg.ts`.

- [ ] **Step 1: Create `src/commands/rpg/work.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { db } from "../../lib/database.js";
import { rpgProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
import {
	getOrCreateProfile,
	updateCoins,
	isInJail,
	setCooldown,
	getCooldown,
	getEquippedTool,
	type StatKey,
} from "../../db/queries/rpg.js";
import { rollOutcome, randomPay } from "../../lib/rpg/helpers/outcome.js";
import { applyJobRewards } from "../../lib/rpg/helpers/rewards.js";
import { getRemainingCooldown, formatDuration } from "../../lib/rpg/helpers/cooldown.js";
import { JOBS, getJob } from "../../lib/rpg/catalogs/jobs.js";
import { calculateLevel } from "../../lib/rpg/helpers/rewards.js";
import { ITEMS } from "../../lib/rpg/catalogs/items.js";

async function addXpToProfile(userId: string, amount: number): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
	const [row] = await db
		.update(rpgProfiles)
		.set({ xp: sql`${rpgProfiles.xp} + ${amount}` })
		.where(eq(rpgProfiles.userId, userId))
		.returning({ xp: rpgProfiles.xp, level: rpgProfiles.level });
	const newLevel = calculateLevel(row.xp);
	const leveledUp = newLevel > row.level;
	if (leveledUp) {
		await db.update(rpgProfiles).set({ level: newLevel }).where(eq(rpgProfiles.userId, userId));
	}
	return { newXp: row.xp, newLevel, leveledUp };
}

const JOB_CHOICES = Object.values(JOBS).map((j) => ({ name: j.name, value: j.id }));

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

		const { profile, stats } = await getOrCreateProfile(interaction.user.id);

		// Jail check
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

		// Cooldown check
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

		// Stat gate check
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

		// Determine relevant stats for outcome roll
		const relevantStats = statEntries.map(([stat]) => stat);

		// Roll outcome
		const { success, finalChance } = rollOutcome({
			baseSuccessChance: job.baseSuccessChance,
			relevantStats,
			stats,
			toolBypass: !meetsStatGate && hasToolBypass,
		});

		// Set cooldown regardless of outcome
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

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle(`✅ ${job.name} — Success!`)
						.setDescription(
							`You earned **${pay.toLocaleString()} coins** and **${job.xpReward} XP**.${dropText}${levelText}`,
						)
						.setFooter({ text: `Success chance was ${Math.round(finalChance * 100)}% • Next available in ${formatDuration(job.cooldownMs)}` }),
				],
			});
		} else {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle(`❌ ${job.name} — Failed`)
						.setDescription("Better luck next time. No coins lost.")
						.setFooter({ text: `Success chance was ${Math.round(finalChance * 100)}% • Next available in ${formatDuration(job.cooldownMs)}` }),
				],
			});
		}
	}
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/work.ts
git commit -m "feat(rpg): add /work command"
```

---

## Task 2: `/shop` command + pagination interaction handler

**Files:**
- Create: `src/commands/rpg/shop.ts`
- Create: `src/interaction-handlers/rpgShopPage.ts`

The shop has three subcommands:
- **browse** — shows a paginated embed of buyable items (5 per page) with Previous/Next buttons
- **buy `<item>`** — deducts coins and adds item to inventory
- **sell `<item>`** — removes item from inventory and adds coins (50% of buy price for non-zero priced items; collectibles sell at their special value)

Sell prices:
- `rare_gem`: 2000 coins (spec value)
- `old_coin`: 500 coins
- All other items with `price > 0`: `Math.floor(price * 0.5)`
- Items with `price === 0` that aren't collectibles: not sellable

The pagination handler (`rpgShopPage.ts`) responds to button customIds `rpgshop:prev:<page>` and `rpgshop:next:<page>`. It re-renders the same embed with the new page offset. The page state is encoded in the button's customId — no DB state needed.

- [ ] **Step 1: Create `src/commands/rpg/shop.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { getOrCreateProfile, updateCoins, addItem, removeItem, getInventory } from "../../db/queries/rpg.js";
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
			await interaction.deferReply({ ephemeral: true });
			const itemId = interaction.options.getString("item", true);
			const item = getItem(itemId);
			if (!item || item.price === 0) {
				return interaction.editReply({ content: "That item isn't available in the shop." });
			}

			const { profile } = await getOrCreateProfile(interaction.user.id);
			if (profile.coins < item.price) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(`❌ You need **${item.price.toLocaleString()} coins** but only have **${profile.coins.toLocaleString()}**.`),
					],
				});
			}

			await updateCoins(interaction.user.id, -item.price);
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
			await interaction.deferReply({ ephemeral: true });
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
```

- [ ] **Step 2: Create `src/interaction-handlers/rpgShopPage.ts`**

```typescript
import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { buildShopPage } from "../commands/rpg/shop.js";

export class RpgShopPageHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("rpgshop:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const [, direction, pageStr] = interaction.customId.split(":");
		const currentPage = parseInt(pageStr, 10);
		const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;

		const { embed, row } = buildShopPage(newPage);
		return interaction.update({ embeds: [embed], components: [row] });
	}
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/rpg/shop.ts src/interaction-handlers/rpgShopPage.ts
git commit -m "feat(rpg): add /shop command and pagination handler"
```

---

## Task 3: `/inventory` command

**Files:**
- Create: `src/commands/rpg/inventory.ts`

Three subcommands:
- **view** — shows all items in the player's inventory as an embed table
- **use `<item>`** — uses a consumable item (energy_drink or lucky_charm); effects are not persisted to DB in Phase 2 since they apply to the next action (Phase 3 crime will use them). For now: energy_drink removes the cooldown on the last-used job (finds the soonest-expiring `job:*` cooldown and clears it); lucky_charm is acknowledged but its effect is tracked via a text acknowledgement only (full implementation in Phase 3). Both remove the item from inventory on use.
- **equip `<item>`** — equips a tool item to the `tool` slot using `equipItem()`

The `use` subcommand for `energy_drink` finds and deletes the player's soonest active `job:*` cooldown using `clearCooldown()`.

- [ ] **Step 1: Create `src/commands/rpg/inventory.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
	getInventory,
	removeItem,
	equipItem,
	clearCooldown,
} from "../../db/queries/rpg.js";
import { db } from "../../lib/database.js";
import { rpgCooldowns } from "../../db/schema.js";
import { and, eq, asc, like } from "drizzle-orm";
import { ITEMS, getItem } from "../../lib/rpg/catalogs/items.js";

export class InventoryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
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
			await interaction.deferReply({ ephemeral: true });
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
			await interaction.deferReply({ ephemeral: true });
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
				// Clear the soonest active job cooldown
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
					// Refund the item since player isn't jailed
					await removeItem(interaction.user.id, itemId, -1); // re-add
					return interaction.editReply({ content: "You're not in jail!" });
				}
				const { clearJail } = await import("../../db/queries/rpg.js");
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
			await interaction.deferReply({ ephemeral: true });
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
```

- [ ] **Step 2: Fix the jail_key branch — dynamic import is wrong**

The `jail_key` branch above uses a dynamic `import()` which is an anti-pattern. Replace it with a static import at the top of the file. Edit `src/commands/rpg/inventory.ts` — change the imports section to:

```typescript
import {
	getOrCreateProfile,
	getInventory,
	removeItem,
	equipItem,
	clearCooldown,
	clearJail,
} from "../../db/queries/rpg.js";
```

And replace the `jail_key` branch's dynamic import line:
```typescript
const { clearJail } = await import("../../db/queries/rpg.js");
await clearJail(interaction.user.id);
```
with just:
```typescript
await clearJail(interaction.user.id);
```

Also remove the erroneous refund line `await removeItem(interaction.user.id, itemId, -1);` — `removeItem` with a negative quantity is not a valid operation. Replace the not-jailed branch with:

```typescript
if (!profile.jailUntil || profile.jailUntil <= new Date()) {
	return interaction.editReply({ content: "You're not in jail! The key dissolved uselessly." });
}
await clearJail(interaction.user.id);
```

The final `src/commands/rpg/inventory.ts` should be:

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
	getInventory,
	removeItem,
	equipItem,
	clearCooldown,
	clearJail,
} from "../../db/queries/rpg.js";
import { db } from "../../lib/database.js";
import { rpgCooldowns } from "../../db/schema.js";
import { and, asc, eq, like } from "drizzle-orm";
import { getItem } from "../../lib/rpg/catalogs/items.js";

export class InventoryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
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
			await interaction.deferReply({ ephemeral: true });
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
			await interaction.deferReply({ ephemeral: true });
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
			await interaction.deferReply({ ephemeral: true });
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/rpg/inventory.ts
git commit -m "feat(rpg): add /inventory command"
```

---

## Task 4: End-to-end verification

- [ ] **Step 1: Push schema (no changes needed — Phase 1 already created all tables)**

```bash
pnpm db:push
```
Expected: "No changes detected" or just confirms existing tables. No new migrations.

- [ ] **Step 2: Start the bot**

```bash
pnpm dev
```
Expected: Bot starts, Sapphire auto-discovers `/work`, `/shop`, `/inventory`.

- [ ] **Step 3: Verify `/work fishing` without rod**

Run `/work job:Fishing`

Expected: Success or failure at reduced rate (base 0.75 * 0.6 = 45% since no rod equipped and fishing has toolBypass). Embed shows success/failure with coins gained or failure message. Cooldown set.

- [ ] **Step 4: Verify `/work fishing` on cooldown**

Run `/work job:Fishing` again immediately.

Expected: "⏳ Fishing is on cooldown. Ready in ~5m."

- [ ] **Step 5: Verify stat-gated job rejection**

Run `/work job:Construction` with STR < 30 and no pickaxe equipped.

Expected: "❌ Can't work as Construction — Requirements not met: Strength 30 (you: 1)"

- [ ] **Step 6: Verify shop browse**

Run `/shop browse`

Expected: Embed with first 5 buyable items, Previous disabled, Next enabled (or disabled if ≤ 5 items). Clicking Next shows next page.

- [ ] **Step 7: Verify shop buy and inventory**

Run `/shop buy item:Fishing Rod`

Expected (with 0 coins): "❌ You need 200 coins but only have 0."

Grant coins by directly running `/train` several times or checking the DB, then buy. Then run `/inventory view` — should show Fishing Rod ×1.

- [ ] **Step 8: Verify equip and work improvement**

Run `/inventory equip item:fishing_rod`

Expected: "🔧 Fishing Rod equipped to your tool slot."

Run `/inventory view` — Fishing Rod should show *(equipped)*.

Run `/work job:Fishing` — now uses full base chance (0.75) since rod is equipped and stat gate is met via tool.

- [ ] **Step 9: Verify sell**

Run `/shop sell item:fishing_rod`

Expected: "✅ Sold 1x Fishing Rod for 100 coins." (50% of 200).

- [ ] **Step 10: Commit verification marker**

```bash
git commit --allow-empty -m "chore(rpg): phase 2 verified end-to-end"
```

---

## Phase 3 Preview

Phase 3 plan (`2026-04-05-rpg-phase3-crime-jail-ollama.md`) will cover:
- `/crime <action> [--target @user]` — crime command with pickpocket, rob_player, rob_bank
- `src/interaction-handlers/rpgJailActions.ts` — Pay Bail / Escape buttons
- Ollama flavor text integration (`src/lib/rpg/helpers/flavorText.ts`)
- `docker-compose.yml` — add Ollama service
