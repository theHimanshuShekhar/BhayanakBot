# RPG Phase 4: Pets & Property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/pet` (view, adopt, rename) and `/property` (view, buy, collect) commands, completing the Phase 4 RPG feature set.

**Architecture:** Catalogs (`pets.ts`, `properties.ts`), schema tables (`rpgOwnedPets`, `rpgOwnedProperties`), and most query helpers are already in place from Phase 1. Phase 4 adds one missing query helper (`renamePet`), then builds the two commands on top of existing infrastructure. Property income is calculated on-the-fly at `/property collect` time using `lastCollectedAt` — no scheduled task or extra DB column needed (YAGNI; equivalent gameplay result).

**Tech Stack:** Sapphire Framework v5, Discord.js v14, Drizzle ORM, TypeScript ESM (`.js` imports)

---

## Existing infrastructure (do NOT recreate)

| Already exists | Location |
|---|---|
| `Pet` type + `PETS` catalog + `getPet`, `getBuyablePets` | `src/lib/rpg/catalogs/pets.ts` |
| `Property` type + `PROPERTIES` catalog + `getProperty`, `getBuyableProperties` | `src/lib/rpg/catalogs/properties.ts` |
| `rpgOwnedPets` schema (id, userId, petId, nickname, acquiredAt) | `src/db/schema.ts:241` |
| `rpgOwnedProperties` schema (id, userId, propertyId, purchasedAt, lastCollectedAt) | `src/db/schema.ts:249` |
| `RpgOwnedPet`, `RpgOwnedProperty` types | `src/db/queries/rpg.ts:15-16` |
| `getOwnedPets(userId)`, `addPet(userId, petId)` | `src/db/queries/rpg.ts:157-163` |
| `getOwnedProperties(userId)`, `addProperty(userId, propertyId)`, `updateLastCollectedAt(propertyOwnedId)` | `src/db/queries/rpg.ts:167-180` |
| `updateCoins(userId, delta)`, `getOrCreateProfile(userId)` | `src/db/queries/rpg.ts` |

---

## Task 1: Add `renamePet` query helper

**Files:**
- Modify: `src/db/queries/rpg.ts` (append after line 163, inside the `--- Pets ---` section)

- [ ] **Step 1: Read the file to confirm current line count and imports**

```bash
grep -n "addPet\|renamePet\|--- Pets ---\|--- Properties ---" src/db/queries/rpg.ts
```

Expected output shows `addPet` around line 161, `--- Properties ---` around line 165. The `and` operator is already imported on line 1.

- [ ] **Step 2: Append `renamePet` after `addPet`**

Add this function after the `addPet` function (before `// --- Properties ---`):

```typescript
export async function renamePet(userId: string, petId: string, nickname: string): Promise<boolean> {
	const [row] = await db
		.update(rpgOwnedPets)
		.set({ nickname })
		.where(and(eq(rpgOwnedPets.userId, userId), eq(rpgOwnedPets.petId, petId)))
		.returning({ id: rpgOwnedPets.id });
	return row !== undefined;
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/rpg.ts
git commit -m "feat(rpg): add renamePet query helper"
```

---

## Task 2: Create `/pet` command

**Files:**
- Create: `src/commands/rpg/pet.ts`

**Subcommands:**
- `view` — list owned pets with nickname, rarity, description
- `adopt` — buy a pet from the catalog (price > 0 only)
- `rename` — set nickname on an owned pet (uses `renamePet` from Task 1)

- [ ] **Step 1: Create `src/commands/rpg/pet.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateProfile, getOwnedPets, addPet, renamePet, updateCoins } from "../../db/queries/rpg.js";
import { getBuyablePets, getPet } from "../../lib/rpg/catalogs/pets.js";

const RARITY_COLOR: Record<string, number> = {
	common: 0x99aab5,
	uncommon: 0x57f287,
	rare: 0x5865f2,
	legendary: 0xfee75c,
};

const PET_CHOICES = getBuyablePets().map((p) => ({
	name: `${p.emoji} ${p.name} (${p.price.toLocaleString()} coins)`,
	value: p.id,
}));

export class PetCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("pet")
				.setDescription("View, adopt, or rename your pets")
				.addSubcommand((sub) => sub.setName("view").setDescription("View your pets"))
				.addSubcommand((sub) =>
					sub
						.setName("adopt")
						.setDescription("Adopt a pet from the market")
						.addStringOption((opt) =>
							opt
								.setName("pet")
								.setDescription("Pet to adopt")
								.setRequired(true)
								.addChoices(...PET_CHOICES),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("rename")
						.setDescription("Give a pet a nickname")
						.addStringOption((opt) =>
							opt.setName("pet").setDescription("Pet ID to rename (e.g. cat, dog, parrot)").setRequired(true),
						)
						.addStringOption((opt) =>
							opt.setName("name").setDescription("New nickname (max 32 chars)").setRequired(true),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand(true);

		if (sub === "view") {
			await interaction.deferReply({ ephemeral: true });
			const pets = await getOwnedPets(interaction.user.id);

			if (pets.length === 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x5865f2)
							.setDescription("You don't own any pets yet. Use `/pet adopt` to get one."),
					],
				});
			}

			const lines = pets.map((op) => {
				const pet = getPet(op.petId);
				const display = op.nickname
					? `**${op.nickname}** *(${pet?.name ?? op.petId})*`
					: `**${pet?.name ?? op.petId}**`;
				return `${pet?.emoji ?? "🐾"} ${display}\n*${pet?.description ?? ""}* \`[${pet?.rarity ?? "?"}]\``;
			});

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle("🐾 Your Pets")
						.setColor(0x5865f2)
						.setDescription(lines.join("\n\n")),
				],
			});
		}

		if (sub === "adopt") {
			await interaction.deferReply({ ephemeral: true });
			const petId = interaction.options.getString("pet", true);
			const pet = getPet(petId);

			if (!pet || pet.price === 0) {
				return interaction.editReply({ content: "That pet isn't available for adoption." });
			}

			const { profile } = await getOrCreateProfile(interaction.user.id);

			if (profile.coins < pet.price) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(
								`❌ You need **${pet.price.toLocaleString()} coins** to adopt ${pet.emoji} **${pet.name}**, but you only have **${profile.coins.toLocaleString()}**.`,
							),
					],
				});
			}

			await updateCoins(interaction.user.id, -pet.price);
			await addPet(interaction.user.id, petId);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(RARITY_COLOR[pet.rarity] ?? 0x5865f2)
						.setTitle(`${pet.emoji} Adopted ${pet.name}!`)
						.setDescription(`*${pet.description}*\n\nPaid **${pet.price.toLocaleString()} coins**.`)
						.setFooter({ text: `Rarity: ${pet.rarity}` }),
				],
			});
		}

		if (sub === "rename") {
			await interaction.deferReply({ ephemeral: true });
			const petId = interaction.options.getString("pet", true);
			const newName = interaction.options.getString("name", true).slice(0, 32);
			const pet = getPet(petId);

			const updated = await renamePet(interaction.user.id, petId, newName);
			if (!updated) {
				return interaction.editReply({ content: "You don't own a pet with that ID." });
			}

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setDescription(`${pet?.emoji ?? "🐾"} **${pet?.name ?? petId}** renamed to **${newName}**.`),
				],
			});
		}
	}
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/pet.ts
git commit -m "feat(rpg): add /pet command (view, adopt, rename)"
```

---

## Task 3: Create `/property` command

**Files:**
- Create: `src/commands/rpg/property.ts`

**Subcommands:**
- `view` — list owned properties; for income-generating ones, show hours since last collect and pending coins
- `buy` — purchase a property (blocks duplicate ownership of same property)
- `collect` — calculate `floor(hoursSince * incomePerHour)` for each income-generating property, credit coins, update `lastCollectedAt`

**Income formula:** `Math.floor((Date.now() - op.lastCollectedAt.getTime()) / (1000 * 60 * 60) * prop.incomePerHour)`

- [ ] **Step 1: Create `src/commands/rpg/property.ts`**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
	getOwnedProperties,
	addProperty,
	updateLastCollectedAt,
	updateCoins,
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
			await interaction.deferReply({ ephemeral: true });
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
			await interaction.deferReply({ ephemeral: true });
			const propertyId = interaction.options.getString("property", true);
			const prop = getProperty(propertyId);

			if (!prop) {
				return interaction.editReply({ content: "Unknown property." });
			}

			const { profile } = await getOrCreateProfile(interaction.user.id);
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

			if (profile.coins < prop.price) {
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

			await updateCoins(interaction.user.id, -prop.price);
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
			await interaction.deferReply({ ephemeral: true });
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
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/property.ts
git commit -m "feat(rpg): add /property command (view, buy, collect)"
```

---

## Task 4: Full build + lint verification

**Files:** none changed — verification only

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run lint + format check**

```bash
pnpm check
```

Expected: `No fixes applied.` or applies minor formatting fixes. If fixes are applied, they are auto-written — just commit them.

- [ ] **Step 3: Commit any lint fixes (only if `pnpm check` modified files)**

```bash
git add -A
git diff --staged --quiet || git commit -m "chore: apply biome formatting fixes"
```

---

## Manual verification steps

After deploying or running `pnpm dev`:

1. `/pet view` → "You don't own any pets yet."
2. `/pet adopt cat` → deducts 500 coins, success embed
3. `/pet view` → shows Stray Cat with emoji and rarity
4. `/pet rename cat Whiskers` → "Stray Cat renamed to Whiskers"
5. `/pet view` → shows **Whiskers** *(Stray Cat)*
6. `/property view` → "You don't own any properties."
7. `/property buy food_stall` → deducts 3000 coins, shows 30/hr income
8. `/property collect` (immediately) → "No income to collect yet."
9. (wait a few minutes, or temporarily lower the divisor for testing)
10. `/property collect` → credits coins, updates lastCollectedAt
11. `/profile` → shows pet in the Pets field
