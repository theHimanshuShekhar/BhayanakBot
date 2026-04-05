# RPG Phase 3: Crime, Jail, Ollama Flavor Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/crime` command with jail mechanics, interactive jail action buttons (bail/escape), Ollama-powered flavor text for work/crime outcomes, and wire up the lucky_charm consumable buff.

**Architecture:** `flavorText.ts` wraps an Ollama HTTP call with 2-second timeout and static fallback. `addXpToProfile` moves from `work.ts` to `db/queries/rpg.ts` to be shared. `crime.ts` reuses the same outcome/reward pipeline as `work.ts` but adds jail-on-failure logic and a rob_player special case. Jail actions are handled by an interaction handler that reads live profile state and uses `interaction.update()` + `interaction.followUp()` for clean UX.

**Tech Stack:** TypeScript ESM, Sapphire Framework v5, Discord.js v14, Drizzle ORM, Node.js `fetch` API, Ollama REST API

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/rpg/helpers/flavorText.ts` | Ollama fetch wrapper with fallback |
| Modify | `src/db/queries/rpg.ts` | Add shared `addXpToProfile` at end of file |
| Modify | `src/commands/rpg/inventory.ts` | Wire `setCooldown` in lucky_charm branch |
| Modify | `src/commands/rpg/work.ts` | Filter crimes, check/consume lucky_charm, use shared `addXpToProfile`, add flavor text |
| Create | `src/commands/rpg/crime.ts` | `/crime` command with jail-on-failure |
| Create | `src/interaction-handlers/rpgJailActions.ts` | Bail and escape button handlers |
| Modify | `docker-compose.yml` | Add `ollama` service + env var for bot |

---

### Task 1: Flavor text helper

**Files:**
- Create: `src/lib/rpg/helpers/flavorText.ts`

- [ ] **Step 1: Create the file**

```typescript
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "tinyllama";

const FALLBACK_LINES: { success: string[]; failure: string[] } = {
	success: [
		"Another day, another coin.",
		"The work was hard, but the pay was harder to argue with.",
		"Fortune favors the bold — and you were adequately bold.",
		"You pocket the coins and try to look nonchalant.",
		"Success never looked so effortless. (It wasn't.)",
	],
	failure: [
		"The universe had other plans.",
		"Your confidence exceeded your competence. Next time.",
		"You gave it your all. Your all was not enough today.",
		"The dice hate you specifically.",
		"A valiant effort. Embarrassingly unsuccessful.",
	],
};

function fallback(success: boolean): string {
	const pool = success ? FALLBACK_LINES.success : FALLBACK_LINES.failure;
	return pool[Math.floor(Math.random() * pool.length)];
}

export async function generateFlavorText(context: {
	action: string;
	success: boolean;
	pay?: number;
	playerName: string;
	details?: string;
}): Promise<string> {
	const outcomeWord = context.success ? "succeeded" : "failed";
	const payClause = context.pay !== undefined ? ` earning ${context.pay} coins` : "";
	const detailsClause = context.details ? ` (${context.details})` : "";
	const prompt = `${context.playerName} just ${outcomeWord} at ${context.action}${payClause}${detailsClause}. Narrate in one witty sentence.`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				system: "You are a witty RPG narrator. One sentence only. No quotation marks.",
				prompt,
				stream: false,
			}),
			signal: controller.signal,
		});
		if (!res.ok) return fallback(context.success);
		const data = (await res.json()) as { response?: string };
		const text = data.response?.trim();
		if (!text) return fallback(context.success);
		return text;
	} catch {
		return fallback(context.success);
	} finally {
		clearTimeout(timeout);
	}
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build 2>&1 | head -30`
Expected: no errors for the new file

- [ ] **Step 3: Commit**

```bash
git add src/lib/rpg/helpers/flavorText.ts
git commit -m "feat(rpg): add Ollama flavor text helper with static fallback"
```

---

### Task 2: Shared `addXpToProfile` in rpg.ts

**Files:**
- Modify: `src/db/queries/rpg.ts` (append at end)

- [ ] **Step 1: Append the function**

Append to the end of `src/db/queries/rpg.ts` (after `updateLastCollectedAt`):

```typescript
export async function addXpToProfile(
	userId: string,
	amount: number,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
	const [row] = await db
		.update(rpgProfiles)
		.set({ xp: sql`${rpgProfiles.xp} + ${amount}` })
		.where(eq(rpgProfiles.userId, userId))
		.returning({ xp: rpgProfiles.xp, level: rpgProfiles.level });
	// Inline formula to avoid circular import with rewards.ts (which also imports from this file)
	const newLevel = Math.floor(0.05 * Math.sqrt(row.xp));
	const leveledUp = newLevel > row.level;
	if (leveledUp) {
		await db.update(rpgProfiles).set({ level: newLevel }).where(eq(rpgProfiles.userId, userId));
	}
	return { newXp: row.xp, newLevel, leveledUp };
}
```

Note: `sql` and `eq` are already imported at the top of `rpg.ts`. Confirm `rpgProfiles` is also imported — it is, as it's used in `getOrCreateProfile`.

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/rpg.ts
git commit -m "feat(rpg): add shared addXpToProfile to db/queries/rpg"
```

---

### Task 3: Wire lucky_charm in inventory.ts

**Files:**
- Modify: `src/commands/rpg/inventory.ts`

The `lucky_charm` branch at line 116 currently only shows a message. It must also call `setCooldown(userId, "buff:lucky_charm", 24 * 60 * 60 * 1000)` so the buff can be consumed by `/work` and `/crime`.

`setCooldown` is already imported at the top of `inventory.ts`.

- [ ] **Step 1: Replace the lucky_charm branch**

Find this block (lines 116–124):
```typescript
			if (itemId === "lucky_charm") {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setDescription("🍀 Used **Lucky Charm** — your next action has +10% success chance. *(Effect active until your next `/work` or `/crime`)*"),
					],
				});
			}
```

Replace with:
```typescript
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
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/inventory.ts
git commit -m "feat(rpg): activate lucky_charm buff in inventory use handler"
```

---

### Task 4: Update work.ts — filter crimes, lucky_charm, shared addXpToProfile, flavor text

**Files:**
- Modify: `src/commands/rpg/work.ts`

Changes required:
1. Remove the local `addXpToProfile` function (lines 19–31)
2. Add `addXpToProfile`, `getCooldown`, `clearCooldown` to rpg.js imports
3. Filter crime jobs out of `JOB_CHOICES`
4. Check and consume `buff:lucky_charm` before rolling outcome
5. Pass `consumableBonus` to `rollOutcome` if charm active
6. Import and call `generateFlavorText` (fire-and-forget via `Promise.resolve`)
7. Import `getJobsByCategory` or filter inline using `job.category !== "crime"`

- [ ] **Step 1: Rewrite work.ts**

```typescript
import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { db } from "../../lib/database.js";
import { rpgProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
import {
	getOrCreateProfile,
	isInJail,
	setCooldown,
	getCooldown,
	clearCooldown,
	getEquippedTool,
	addXpToProfile,
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

		// Block crime jobs from /work
		if (job.category === "crime") {
			return interaction.editReply({ content: "Use `/crime` for criminal activities." });
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

		// Check and consume lucky_charm buff
		const charmCooldown = await getCooldown(interaction.user.id, "buff:lucky_charm");
		const hasCharm = charmCooldown !== null && charmCooldown > 0;
		if (hasCharm) {
			await clearCooldown(interaction.user.id, "buff:lucky_charm");
		}

		// Determine relevant stats for outcome roll
		const relevantStats = statEntries.map(([stat]) => stat);

		// Roll outcome
		const { success, finalChance } = rollOutcome({
			baseSuccessChance: job.baseSuccessChance,
			relevantStats,
			stats,
			toolBypass: !meetsStatGate && hasToolBypass,
			consumableBonus: hasCharm ? 0.1 : 0,
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
			const charmText = hasCharm ? "\n🍀 *Lucky Charm bonus applied!*" : "";

			const flavor = await generateFlavorText({
				action: job.name,
				success: true,
				pay,
				playerName: interaction.user.displayName,
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
			const flavor = await generateFlavorText({
				action: job.name,
				success: false,
				playerName: interaction.user.displayName,
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
```

Note: Remove the unused `db`, `rpgProfiles`, `sql` imports if TypeScript/Biome complains — those were only used by the local `addXpToProfile`.

- [ ] **Step 2: Verify build (check for unused import errors)**

Run: `pnpm build 2>&1 | head -40`

If you see errors about unused `db`, `rpgProfiles`, or `sql` imports (they were used in the removed local function), remove those three import lines:
```typescript
import { db } from "../../lib/database.js";
import { rpgProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
```

Run `pnpm build` again — expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/commands/rpg/work.ts
git commit -m "feat(rpg): filter crimes from /work, add lucky_charm + flavor text"
```

---

### Task 5: Create `/crime` command

**Files:**
- Create: `src/commands/rpg/crime.ts`

Crime jobs from `jobs.ts`: `pickpocket` (AGI none, jail 5min), `rob_player` (AGI 30, jail 20min), `rob_bank` (INT 60 + AGI 50, jail 2h). All have `category: "crime"`.

`rob_player` requires a Discord user target. On failure, attacker pays 20% of attempted steal to victim (capped at attacker's coins).

- [ ] **Step 1: Create the file**

```typescript
import { Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
	isInJail,
	setCooldown,
	getCooldown,
	clearCooldown,
	getEquippedTool,
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

		// rob_player requires a target
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

		// Jail check
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

		// Check and consume lucky_charm buff
		const charmCooldown = await getCooldown(interaction.user.id, "buff:lucky_charm");
		const hasCharm = charmCooldown !== null && charmCooldown > 0;
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

		// Set cooldown regardless of outcome
		await setCooldown(interaction.user.id, `job:${jobId}`, job.cooldownMs);

		if (success) {
			let pay: number;
			let dropText = "";
			let levelText = "";

			if (jobId === "rob_player" && target) {
				const { profile: victimProfile } = await getOrCreateProfile(target.id);
				pay = Math.min(randomPay(job.payRange[0], job.payRange[1]), victimProfile.coins);
				await updateCoins(target.id, -pay);
				await updateCoins(interaction.user.id, pay);
			} else {
				const result = await applyJobRewards(interaction.user.id, randomPay(job.payRange[0], job.payRange[1]), job.dropTable);
				pay = randomPay(job.payRange[0], job.payRange[1]);
				dropText =
					result.droppedItems.length > 0
						? "\n\n**Item drop:** " + result.droppedItems.map((id) => ITEMS[id]?.name ?? id).join(", ")
						: "";
				// Re-apply correct pay (applyJobRewards already credited the coins, reuse the same value)
				// Actually we need a clean approach: call applyJobRewards and use its internal pay
			}

			const { newLevel, leveledUp } = await addXpToProfile(interaction.user.id, job.xpReward);
			levelText = leveledUp ? `\n\n⭐ **Level up! You're now level ${newLevel}!**` : "";

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
			// Failure: send to jail
			const jailMs = job.jailSentenceMs ?? 5 * 60 * 1000;
			const jailUntil = new Date(Date.now() + jailMs);
			const bailCost = Math.floor(job.payRange[0] * 0.5);

			await db
				.update(rpgProfiles)
				.set({ jailUntil, jailBailCost: bailCost })
				.where(eq(rpgProfiles.userId, interaction.user.id));

			const until = Math.floor(jailUntil.getTime() / 1000);

			// Compensation for rob_player failure
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
```

**Important note:** The success branch for non-rob_player jobs has a duplication issue with `pay`. Fix it as follows — replace the entire `if (success)` block with this cleaner version:

```typescript
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
		}
```

The `crime.ts` file also needs these imports at the top (db + schema) for the jail-on-failure update:

```typescript
import { db } from "../../lib/database.js";
import { rpgProfiles } from "../../db/schema.js";
import { eq } from "drizzle-orm";
```

- [ ] **Step 2: Check the jobs catalog for `jailSentenceMs` field**

Run: `grep -n "jailSentenceMs" src/lib/rpg/catalogs/jobs.ts`

Expected: 3 matches for crime jobs. If the field doesn't exist in the `Job` type, you must also add it to the Job interface in `jobs.ts`:
```typescript
jailSentenceMs?: number;
```

- [ ] **Step 3: Check that `jailBailCost` exists in the schema**

Run: `grep -n "jailBailCost" src/db/schema.ts`

Expected: a column definition. If not found, do NOT add it here — that's a schema change that would need a migration. Instead, use a separate table or store the bail cost in a cooldown entry like `setCooldown(userId, "jail:bail_cost", jailMs, bailCost)`. However, `profile.jailBailCost` is referenced in `rpgJailActions.ts` (Task 6). Confirm it exists before proceeding.

- [ ] **Step 4: Verify build**

Run: `pnpm build 2>&1 | head -50`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/commands/rpg/crime.ts
git commit -m "feat(rpg): add /crime command with jail-on-failure and rob_player"
```

---

### Task 6: Jail action interaction handler

**Files:**
- Create: `src/interaction-handlers/rpgJailActions.ts`

- [ ] **Step 1: Verify `setJail` / `clearJail` signatures in rpg.ts**

Run: `grep -n "setJail\|clearJail" src/db/queries/rpg.ts`

Expected output should show both functions. Note their exact signatures. `clearJail` sets `jailUntil = null`. `setJail` (if it exists) takes `(userId, jailUntil, bailCost)`. If `setJail` doesn't exist, the jail update must be done inline with `db.update`.

- [ ] **Step 2: Create the file**

```typescript
import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, EmbedBuilder } from "discord.js";
import {
	getOrCreateProfile,
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

			if (profile.coins < bailCost) {
				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(`❌ You need **${bailCost.toLocaleString()} coins** to bail out, but you only have **${profile.coins.toLocaleString()}**.`),
					],
					ephemeral: true,
				});
				return;
			}

			await db
				.update(rpgProfiles)
				.set({ coins: profile.coins - bailCost, jailUntil: null, jailBailCost: 0 })
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
			// One escape attempt per sentence
			const escapeUsed = await getCooldown(userId, "jail:escape");
			if (escapeUsed !== null && escapeUsed > 0) {
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

			// Mark escape as used (expires when the sentence would have expired)
			const remainingMs = Math.max(0, jailUntil.getTime() - Date.now());
			await setCooldown(userId, "jail:escape", remainingMs);

			if (success) {
				await clearJail(userId);
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
				// Double the remaining sentence
				const newUntil = new Date(jailUntil.getTime() + remainingMs);
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
```

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | head -50`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/interaction-handlers/rpgJailActions.ts
git commit -m "feat(rpg): add jail action handler (bail + escape)"
```

---

### Task 7: Add Ollama to docker-compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add `OLLAMA_URL` to bot environment block**

In the `bot` service `environment` section (after `NODE_ENV: production`), add:
```yaml
      OLLAMA_URL: http://ollama:11434
```

- [ ] **Step 2: Add `ollama` service before `networks:`**

```yaml
  ollama:
    image: ollama/ollama
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    environment:
      OLLAMA_NUM_PARALLEL: "1"
      OLLAMA_MAX_LOADED_MODELS: "1"
    networks:
      - botnet
```

- [ ] **Step 3: Add `ollama_data` volume**

In the `volumes:` section, add:
```yaml
  ollama_data:
```

- [ ] **Step 4: Verify YAML is valid**

Run: `docker compose config --quiet 2>&1`
Expected: no output (valid YAML)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): add ollama service to docker-compose"
```

---

### Task 8: Full build verification

**Files:**
- No file changes

- [ ] **Step 1: Clean build**

Run: `pnpm build 2>&1`
Expected: `tsc` exits 0, no errors

- [ ] **Step 2: Lint check**

Run: `pnpm check 2>&1`
Expected: Biome exits 0, no errors or warnings

- [ ] **Step 3: Confirm all new commands are present**

Run: `ls src/commands/rpg/ src/interaction-handlers/`
Expected output includes:
- `src/commands/rpg/crime.ts`
- `src/commands/rpg/work.ts`
- `src/commands/rpg/inventory.ts`
- `src/interaction-handlers/rpgJailActions.ts`
- `src/interaction-handlers/rpgShopPage.ts`

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(rpg): phase 3 complete — crime, jail, flavor text, lucky_charm"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Ollama flavor text with 2s timeout + fallback | Task 1 |
| Shared `addXpToProfile` in rpg.ts | Task 2 |
| lucky_charm activates `setCooldown` | Task 3 |
| `/work` filters crime jobs | Task 4 |
| `/work` checks + consumes lucky_charm | Task 4 |
| `/work` uses shared `addXpToProfile` | Task 4 |
| `/work` displays flavor text | Task 4 |
| `/crime` crime-only choices | Task 5 |
| `/crime` rob_player target validation | Task 5 |
| `/crime` jail on failure | Task 5 |
| `/crime` rob_player compensation on failure | Task 5 |
| `/crime` lucky_charm support | Task 5 |
| `/crime` flavor text | Task 5 |
| Bail button pays and frees | Task 6 |
| Escape button one-attempt limit | Task 6 |
| Escape success clears jail | Task 6 |
| Escape failure doubles sentence + disables button | Task 6 |
| `docker-compose.yml` ollama service | Task 7 |
| Build + lint clean | Task 8 |
