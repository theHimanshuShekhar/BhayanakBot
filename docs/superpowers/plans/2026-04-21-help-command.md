# Paginated `/help` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a three-level paginated `/help` slash command that lets users browse every bot command by category, drill into any command for description + examples, and jump straight to a category via a `category` argument.

**Architecture:** Help metadata is colocated with each command via a new optional `help` field on Sapphire's `CommandOptions`, exposed through a module augmentation. A `/help` command renders an overview (category list), a category page (commands in that category), or a command detail page (summary + subcommands + examples) using Discord embeds + select menus + buttons. All navigation is ephemeral. Snapshots of the command store are built once and memoized.

**Tech Stack:** TypeScript, Sapphire Framework, discord.js v14, Biome (lint+format).

**Repo convention:** There is no test suite. Verification per task is `pnpm check` (Biome lint/format) and `pnpm build` (TypeScript). End-to-end behavior is verified manually against a live Discord server in the final task.

**Reference spec:** `docs/superpowers/specs/2026-04-21-help-command-design.md`.

---

## File map

Creates (new):

- `src/lib/help/types.ts` — `CommandHelp`, `SubcommandHelp`, `CategoryMeta` types.
- `src/lib/help/categories.ts` — Ordered list of `CategoryMeta` entries.
- `src/lib/help/collect.ts` — `getHelpSnapshot()` walks the command store, caches result.
- `src/lib/help/render.ts` — `buildOverview()`, `buildCategoryPage()`, `buildCommandDetail()`.
- `src/lib/sapphire-augments.ts` — `declare module` augmentation adding `help` to `CommandOptions`.
- `src/commands/utility/help.ts` — The `/help` slash command (chat input + autocomplete).
- `src/interaction-handlers/helpButtons.ts` — Handles `help:*` button clicks.
- `src/interaction-handlers/helpSelectMenu.ts` — Handles `help:select:*` select menus.

Modifies (existing — add `help` to `super()` options):

- All ~55 command files under `src/commands/**/*.ts`.

---

## Conventions used throughout

- All local imports end with `.js` (ESM resolution on `.ts` sources).
- Tabs for indent, double quotes, trailing commas, 120-char line width (Biome-enforced).
- Every task ends with `pnpm check && pnpm build` before commit, matching CLAUDE.md.
- Commit message style: conventional prefix (`feat:`, `docs:`, `chore:`) — matches recent git log.
- `customId` delimiter is `:`.

**Access pattern for help metadata:** Sapphire's base Command constructor does not copy unknown options to instance fields. Access the field as `command.options.help` (not `command.help`). The augmentation below only extends `CommandOptions`. (This clarifies the spec's type-augmentation section, where a redundant `Command` augmentation was also mentioned — we drop that here.)

---

## Task 1: Types + module augmentation

**Files:**
- Create: `src/lib/help/types.ts`
- Create: `src/lib/sapphire-augments.ts`

- [ ] **Step 1: Create `src/lib/help/types.ts`**

```ts
export interface SubcommandHelp {
	summary: string;
	examples: string[];
}

export interface CommandHelp {
	summary: string;
	examples: string[];
	usageNotes?: string;
	subcommands?: Record<string, SubcommandHelp>;
}

export interface CategoryMeta {
	id: string;
	label: string;
	emoji: string;
	description: string;
}
```

- [ ] **Step 2: Create `src/lib/sapphire-augments.ts`**

```ts
import type { CommandHelp } from "./help/types.js";

declare module "@sapphire/framework" {
	interface CommandOptions {
		help?: CommandHelp;
	}
}

export {};
```

The `export {}` makes this a module so TypeScript picks up the augmentation without the file needing a runtime import. No import is required elsewhere — `tsconfig.json` globs `src/**/*.ts`.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm build`
Expected: builds cleanly, no errors.

- [ ] **Step 4: Run lint/format**

Run: `pnpm check`
Expected: passes (the new files should already be formatted correctly).

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/types.ts src/lib/sapphire-augments.ts
git commit -m "feat(help): add help metadata types and CommandOptions augmentation"
```

---

## Task 2: Category metadata

**Files:**
- Create: `src/lib/help/categories.ts`

- [ ] **Step 1: Create `src/lib/help/categories.ts`**

```ts
import type { CategoryMeta } from "./types.js";

export const CATEGORIES: readonly CategoryMeta[] = [
	{ id: "utility", label: "Utility", emoji: "🔧", description: "General-purpose tools: info, avatars, AFK, reminders, summaries." },
	{ id: "moderation", label: "Moderation", emoji: "🛡️", description: "Mute, kick, ban, warn, purge, and case management." },
	{ id: "config", label: "Server Config", emoji: "⚙️", description: "Configure channels, roles, auto-mod, and anti-raid settings." },
	{ id: "roles", label: "Roles", emoji: "🏷️", description: "Reaction roles and role select menus." },
	{ id: "leveling", label: "Leveling", emoji: "📈", description: "XP ranks, leaderboards, and role rewards." },
	{ id: "rpg", label: "RPG & Economy", emoji: "⚔️", description: "Profile, jobs, crime, training, shop, pets, properties, quests." },
	{ id: "fun", label: "Fun", emoji: "🎲", description: "Memes, polls, 8-ball, coin flips, and avatar effects." },
	{ id: "music", label: "Music", emoji: "🎵", description: "Play, queue, and control music in voice channels." },
	{ id: "giveaway", label: "Giveaways", emoji: "🎉", description: "Start, end, and reroll giveaways." },
	{ id: "suggestions", label: "Suggestions", emoji: "💡", description: "Submit and manage community suggestions." },
	{ id: "tickets", label: "Tickets", emoji: "🎫", description: "Open, claim, and manage support tickets." },
	{ id: "autorespond", label: "Autoresponders", emoji: "🤖", description: "Configure automatic message responses (static or LLM-generated)." },
] as const;

export function getCategory(id: string): CategoryMeta | undefined {
	return CATEGORIES.find((c) => c.id === id);
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/categories.ts
git commit -m "feat(help): add category metadata catalog"
```

---

## Task 3: Snapshot collector

**Files:**
- Create: `src/lib/help/collect.ts`

- [ ] **Step 1: Create `src/lib/help/collect.ts`**

```ts
import { container } from "@sapphire/framework";
import type { Command } from "@sapphire/framework";
import { CATEGORIES } from "./categories.js";
import type { CategoryMeta, CommandHelp } from "./types.js";

export interface CollectedCommand {
	name: string;
	categoryId: string;
	help: CommandHelp;
	markers: string[];
	isFallback: boolean;
}

export interface HelpSnapshot {
	categories: CategoryMeta[];
	commandsByCategory: Map<string, CollectedCommand[]>;
	commandByName: Map<string, CollectedCommand>;
}

const PRECONDITION_MARKERS: Record<string, string> = {
	IsModerator: "🛡️",
	IsAdmin: "⚙️",
	IsDJ: "🎧",
};

let cached: HelpSnapshot | null = null;

function resolveCategoryId(cmd: Command): string | null {
	// Sapphire's Piece.location.directories is the relative path from the base.
	// For src/commands/rpg/shop.ts, directories = ["rpg"].
	const dirs = cmd.location.directories;
	if (dirs.length === 0) return null;
	return dirs[0] ?? null;
}

function markersFor(cmd: Command): string[] {
	const precondArr = cmd.options.preconditions as readonly (string | { name: string })[] | undefined;
	if (!precondArr) return [];
	const out: string[] = [];
	for (const entry of precondArr) {
		const name = typeof entry === "string" ? entry : entry.name;
		const marker = PRECONDITION_MARKERS[name];
		if (marker && !out.includes(marker)) out.push(marker);
	}
	return out;
}

function collect(): HelpSnapshot {
	const commandsByCategory = new Map<string, CollectedCommand[]>();
	const commandByName = new Map<string, CollectedCommand>();

	const store = container.stores.get("commands");
	for (const cmd of store.values()) {
		const categoryId = resolveCategoryId(cmd);
		if (!categoryId || !CATEGORIES.find((c) => c.id === categoryId)) continue;

		const fromOptions = cmd.options.help;
		const isFallback = !fromOptions;
		const help: CommandHelp = fromOptions ?? {
			summary: cmd.description || "(no description)",
			examples: [],
		};

		if (isFallback) {
			container.logger.debug(`[help] Command "${cmd.name}" is missing a help field; using fallback.`);
		}

		const entry: CollectedCommand = {
			name: cmd.name,
			categoryId,
			help,
			markers: markersFor(cmd),
			isFallback,
		};
		commandByName.set(cmd.name, entry);
		const list = commandsByCategory.get(categoryId) ?? [];
		list.push(entry);
		commandsByCategory.set(categoryId, list);
	}

	// Sort each category's commands alphabetically by name for stable rendering.
	for (const list of commandsByCategory.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}

	return {
		categories: [...CATEGORIES],
		commandsByCategory,
		commandByName,
	};
}

export function getHelpSnapshot(): HelpSnapshot {
	if (!cached) cached = collect();
	return cached;
}

export function resetHelpSnapshot(): void {
	cached = null;
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/collect.ts
git commit -m "feat(help): add command-store snapshot collector"
```

---

## Task 4: Renderer

**Files:**
- Create: `src/lib/help/render.ts`

- [ ] **Step 1: Create `src/lib/help/render.ts`**

```ts
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import type { APIEmbedField } from "discord.js";
import type { CollectedCommand, HelpSnapshot } from "./collect.js";

export const PAGE_SIZE = 8;
const EMBED_COLOR = 0x5865f2;

export interface RenderedPage {
	embed: EmbedBuilder;
	components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

function buildBackRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("help:home").setLabel("⬅ Overview").setStyle(ButtonStyle.Secondary),
	);
}

export function buildOverview(snapshot: HelpSnapshot, note?: string): RenderedPage {
	const embed = new EmbedBuilder()
		.setTitle("📖 Bot Commands")
		.setColor(EMBED_COLOR)
		.setDescription(
			`${note ? `${note}\n\n` : ""}Pick a category below to see its commands. Use \`/help category:<name>\` to jump directly.`,
		);

	const fields: APIEmbedField[] = snapshot.categories.map((cat) => {
		const count = snapshot.commandsByCategory.get(cat.id)?.length ?? 0;
		return {
			name: `${cat.emoji} ${cat.label}`,
			value: `${cat.description}\n*${count} command${count === 1 ? "" : "s"}*`,
		};
	});
	embed.addFields(fields);

	const select = new StringSelectMenuBuilder()
		.setCustomId("help:select:cat")
		.setPlaceholder("Jump to a category…")
		.addOptions(
			snapshot.categories.map((cat) =>
				new StringSelectMenuOptionBuilder()
					.setLabel(cat.label)
					.setEmoji(cat.emoji)
					.setDescription(truncate(cat.description, 100))
					.setValue(cat.id),
			),
		);

	return {
		embed,
		components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
	};
}

export function buildCategoryPage(snapshot: HelpSnapshot, categoryId: string, page: number): RenderedPage | null {
	const category = snapshot.categories.find((c) => c.id === categoryId);
	if (!category) return null;
	const commands = snapshot.commandsByCategory.get(categoryId) ?? [];
	const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
	const safePage = Math.max(0, Math.min(page, totalPages - 1));
	const slice = commands.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

	const embed = new EmbedBuilder()
		.setTitle(`${category.emoji} ${category.label}`)
		.setColor(EMBED_COLOR)
		.setDescription(category.description);

	for (const cmd of slice) {
		const name = `${cmd.markers.length > 0 ? `${cmd.markers.join(" ")} ` : ""}/${cmd.name}`;
		embed.addFields({ name, value: cmd.help.summary });
	}

	if (totalPages > 1) {
		embed.setFooter({ text: `Page ${safePage + 1}/${totalPages} · ${commands.length} commands` });
	} else {
		embed.setFooter({ text: `${commands.length} command${commands.length === 1 ? "" : "s"}` });
	}

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	if (slice.length > 0) {
		const select = new StringSelectMenuBuilder()
			.setCustomId(`help:select:cmd:${categoryId}:${safePage}`)
			.setPlaceholder("View details for a command…")
			.addOptions(
				slice.map((cmd) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(`/${cmd.name}`)
						.setDescription(truncate(cmd.help.summary, 100))
						.setValue(cmd.name),
				),
			);
		components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
	}

	const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("help:home").setLabel("⬅ Overview").setStyle(ButtonStyle.Secondary),
	);
	if (totalPages > 1) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`help:cat:${categoryId}:${safePage - 1}`)
				.setLabel("◀ Prev")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(safePage === 0),
			new ButtonBuilder()
				.setCustomId(`help:cat:${categoryId}:${safePage + 1}`)
				.setLabel("Next ▶")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(safePage >= totalPages - 1),
		);
	}
	components.push(navRow);

	return { embed, components };
}

export function buildCommandDetail(
	snapshot: HelpSnapshot,
	commandName: string,
	backCategoryId: string | null,
	backPage: number,
): RenderedPage | null {
	const entry = snapshot.commandByName.get(commandName);
	if (!entry) return null;
	const category = snapshot.categories.find((c) => c.id === entry.categoryId);

	const titleMarkers = entry.markers.length > 0 ? ` ${entry.markers.join(" ")}` : "";
	const descriptionParts = [entry.help.summary];
	if (entry.help.usageNotes) descriptionParts.push(entry.help.usageNotes);

	const embed = new EmbedBuilder()
		.setTitle(`/${entry.name}${titleMarkers}`)
		.setColor(EMBED_COLOR)
		.setDescription(descriptionParts.join("\n\n"));

	if (entry.help.examples.length > 0) {
		embed.addFields({
			name: "Examples",
			value: codeBlock(entry.help.examples.map((e) => e).join("\n")),
		});
	} else if (entry.isFallback) {
		embed.addFields({ name: "Examples", value: "*No examples yet.*" });
	}

	if (entry.help.subcommands) {
		for (const [subName, sub] of Object.entries(entry.help.subcommands)) {
			const value =
				sub.examples.length > 0 ? `${sub.summary}\n${codeBlock(sub.examples.join("\n"))}` : sub.summary;
			embed.addFields({ name: `/${entry.name} ${subName}`, value });
		}
	}

	if (category) {
		embed.setFooter({ text: `${category.emoji} ${category.label}` });
	}

	const navRow = new ActionRowBuilder<ButtonBuilder>();
	const targetCategoryId = backCategoryId ?? entry.categoryId;
	const targetCategory = snapshot.categories.find((c) => c.id === targetCategoryId);
	if (targetCategory) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`help:cat:${targetCategoryId}:${backPage}`)
				.setLabel(`⬅ Back to ${targetCategory.label}`)
				.setStyle(ButtonStyle.Secondary),
		);
	}
	navRow.addComponents(
		new ButtonBuilder().setCustomId("help:home").setLabel("⬅ Overview").setStyle(ButtonStyle.Secondary),
	);

	return { embed, components: [navRow] };
}

export function buildOverviewWithNote(snapshot: HelpSnapshot, note: string): RenderedPage {
	return buildOverview(snapshot, note);
}

export function buildNotFoundFallback(snapshot: HelpSnapshot, label: string): RenderedPage {
	return buildOverview(snapshot, `Couldn't find ${label} — here's the full list.`);
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function codeBlock(text: string): string {
	// Guard against the rare case where an example contains triple backticks.
	const safe = text.replace(/```/g, "``\u200b`");
	return `\`\`\`\n${safe}\n\`\`\``;
}

// Export the unused `buildBackRow` so future callers can reuse; currently used indirectly.
export { buildBackRow };
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/render.ts
git commit -m "feat(help): add overview/category/detail renderers"
```

---

## Task 5: `/help` slash command

**Files:**
- Create: `src/commands/utility/help.ts`

- [ ] **Step 1: Create `src/commands/utility/help.ts`**

```ts
import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import type { AutocompleteInteraction } from "discord.js";
import { getHelpSnapshot } from "../../lib/help/collect.js";
import { buildCategoryPage, buildNotFoundFallback, buildOverview } from "../../lib/help/render.js";

export class HelpCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "help",
			description: "Browse all bot commands by category.",
			help: {
				summary: "Show the interactive command help menu.",
				examples: ["/help", "/help category:rpg"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("help")
				.setDescription("Browse all bot commands by category")
				.addStringOption((opt) =>
					opt
						.setName("category")
						.setDescription("Jump straight to a category")
						.setAutocomplete(true)
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const snapshot = getHelpSnapshot();
		const categoryArg = interaction.options.getString("category");

		if (categoryArg) {
			const page = buildCategoryPage(snapshot, categoryArg, 0);
			if (page) {
				return interaction.reply({
					embeds: [page.embed],
					components: page.components,
					flags: MessageFlags.Ephemeral,
				});
			}
			const fallback = buildNotFoundFallback(snapshot, `category \`${categoryArg}\``);
			return interaction.reply({
				embeds: [fallback.embed],
				components: fallback.components,
				flags: MessageFlags.Ephemeral,
			});
		}

		const overview = buildOverview(snapshot);
		return interaction.reply({
			embeds: [overview.embed],
			components: overview.components,
			flags: MessageFlags.Ephemeral,
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name !== "category") return interaction.respond([]);
		const snapshot = getHelpSnapshot();
		const query = focused.value.toLowerCase();
		const matches = snapshot.categories
			.filter((c) => c.id.includes(query) || c.label.toLowerCase().includes(query))
			.slice(0, 25)
			.map((c) => ({ name: `${c.emoji} ${c.label}`, value: c.id }));
		return interaction.respond(matches);
	}
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/commands/utility/help.ts
git commit -m "feat(help): add /help slash command with category autocomplete"
```

---

## Task 6: Button interaction handler

**Files:**
- Create: `src/interaction-handlers/helpButtons.ts`

- [ ] **Step 1: Create `src/interaction-handlers/helpButtons.ts`**

```ts
import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { getHelpSnapshot } from "../lib/help/collect.js";
import { buildCategoryPage, buildNotFoundFallback, buildOverview } from "../lib/help/render.js";

export class HelpButtonsHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("help:")) return this.none();
		// Exclude select-menu customIds that we also prefix with "help:" but route elsewhere.
		if (interaction.customId.startsWith("help:select:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const snapshot = getHelpSnapshot();
		const parts = interaction.customId.split(":");
		const action = parts[1];

		try {
			if (action === "home") {
				const page = buildOverview(snapshot);
				return await interaction.update({ embeds: [page.embed], components: page.components });
			}

			if (action === "cat") {
				const categoryId = parts[2];
				const pageNum = Number.parseInt(parts[3] ?? "0", 10) || 0;
				const page = categoryId ? buildCategoryPage(snapshot, categoryId, pageNum) : null;
				if (!page) {
					const fallback = buildNotFoundFallback(snapshot, `category \`${categoryId ?? "?"}\``);
					return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
				}
				return await interaction.update({ embeds: [page.embed], components: page.components });
			}

			// Unknown action — fall back to overview.
			const fallback = buildNotFoundFallback(snapshot, "that button");
			return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
		} catch (err) {
			// Stale ephemeral message after restart, or other non-fatal Discord errors — swallow.
			this.container.logger.debug("[help] button update failed:", err);
		}
	}
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/interaction-handlers/helpButtons.ts
git commit -m "feat(help): add button interaction handler"
```

---

## Task 7: Select menu interaction handler

**Files:**
- Create: `src/interaction-handlers/helpSelectMenu.ts`

- [ ] **Step 1: Create `src/interaction-handlers/helpSelectMenu.ts`**

```ts
import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { getHelpSnapshot } from "../lib/help/collect.js";
import { buildCategoryPage, buildCommandDetail, buildNotFoundFallback } from "../lib/help/render.js";

export class HelpSelectMenuHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.customId.startsWith("help:select:")) return this.none();
		return this.some();
	}

	public override async run(interaction: StringSelectMenuInteraction) {
		const snapshot = getHelpSnapshot();
		const parts = interaction.customId.split(":");
		const kind = parts[2];

		try {
			if (kind === "cat") {
				const selectedCategoryId = interaction.values[0];
				if (!selectedCategoryId) return;
				const page = buildCategoryPage(snapshot, selectedCategoryId, 0);
				if (!page) {
					const fallback = buildNotFoundFallback(snapshot, `category \`${selectedCategoryId}\``);
					return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
				}
				return await interaction.update({ embeds: [page.embed], components: page.components });
			}

			if (kind === "cmd") {
				const categoryId = parts[3] ?? null;
				const backPage = Number.parseInt(parts[4] ?? "0", 10) || 0;
				const selectedCommand = interaction.values[0];
				if (!selectedCommand) return;
				const detail = buildCommandDetail(snapshot, selectedCommand, categoryId, backPage);
				if (!detail) {
					const fallback = buildNotFoundFallback(snapshot, `command \`/${selectedCommand}\``);
					return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
				}
				return await interaction.update({ embeds: [detail.embed], components: detail.components });
			}

			const fallback = buildNotFoundFallback(snapshot, "that selection");
			return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
		} catch (err) {
			this.container.logger.debug("[help] select-menu update failed:", err);
		}
	}
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/interaction-handlers/helpSelectMenu.ts
git commit -m "feat(help): add select-menu interaction handler"
```

---

## Tasks 8–19 — Populate `help` for each category

**Uniform pattern** — for every command file listed below, locate its class constructor, and add a `help: { ... }` field to the options object passed to `super(context, { ...options, ... })`. Preserve existing options (e.g. `preconditions`, `name`, `description`).

**Example diff shape:**

```ts
// BEFORE
super(context, { ...options });

// AFTER
super(context, {
	...options,
	help: {
		summary: "Short one-line description of what this command does.",
		examples: ['/commandname arg:"value"'],
		// subcommands: { ... }   // only if the command has subcommands
		// usageNotes: "..."      // optional longer explanation
	},
});
```

**If the command already passes explicit options** (e.g. `super(context, { ...options, name: "ban", preconditions: [...] })`), keep those and merge the `help` field in the same object.

Each populate task below enumerates its commands with:
- The file path.
- The exact `help` object to drop in.

Populate tasks are independent — they can be done in any order, and each one is its own commit.

---

## Task 8: Populate — `utility`

**Files modified:**
- `src/commands/utility/afk.ts`
- `src/commands/utility/avatar.ts`
- `src/commands/utility/editsnipe.ts`
- `src/commands/utility/personality.ts`
- `src/commands/utility/ping.ts`
- `src/commands/utility/remind.ts`
- `src/commands/utility/serverinfo.ts`
- `src/commands/utility/snipe.ts`
- `src/commands/utility/summarize.ts`
- `src/commands/utility/userinfo.ts`

Note: `src/commands/utility/help.ts` is already populated by Task 5 — skip it here.

- [ ] **Step 1: Add `help` to `afk.ts`**

```ts
help: {
	summary: "Manage your AFK status — set a message or clear it.",
	examples: ["/afk set reason:brb lunch", "/afk clear"],
	subcommands: {
		set: { summary: "Set yourself as AFK with an optional reason.", examples: ["/afk set reason:studying"] },
		clear: { summary: "Clear your AFK status manually.", examples: ["/afk clear"] },
	},
},
```

- [ ] **Step 2: Add `help` to `avatar.ts`**

```ts
help: {
	summary: "Show a user's avatar at full resolution.",
	examples: ["/avatar", "/avatar user:@someone"],
},
```

- [ ] **Step 3: Add `help` to `editsnipe.ts`**

```ts
help: {
	summary: "Show the last edited message in this channel (before the edit).",
	examples: ["/editsnipe"],
},
```

- [ ] **Step 4: Add `help` to `personality.ts`**

```ts
help: {
	summary: "View the bot's personality profile for a user (admin only).",
	examples: ["/personality", "/personality user:@someone"],
},
```

- [ ] **Step 5: Add `help` to `ping.ts`**

```ts
help: {
	summary: "Check bot latency and API response time.",
	examples: ["/ping"],
},
```

- [ ] **Step 6: Add `help` to `remind.ts`**

```ts
help: {
	summary: "Set, list, and cancel personal reminders.",
	examples: ['/remind set time:2h message:"stretch"', "/remind list", "/remind cancel id:3"],
	subcommands: {
		set: {
			summary: "Set a reminder after a duration (e.g. 10m, 2h, 1d).",
			examples: ['/remind set time:30m message:"check oven"'],
		},
		list: { summary: "List your active reminders.", examples: ["/remind list"] },
		cancel: { summary: "Cancel a reminder by its ID.", examples: ["/remind cancel id:7"] },
	},
},
```

- [ ] **Step 7: Add `help` to `serverinfo.ts`**

```ts
help: {
	summary: "Display information about this server.",
	examples: ["/serverinfo"],
},
```

- [ ] **Step 8: Add `help` to `snipe.ts`**

```ts
help: {
	summary: "Show the last deleted message in this channel.",
	examples: ["/snipe"],
},
```

- [ ] **Step 9: Add `help` to `summarize.ts`**

```ts
help: {
	summary: "Summarize recent messages in this channel using AI.",
	examples: ["/summarize", "/summarize count:100", "/summarize time:2h"],
	usageNotes: "Uses the local Ollama model. `time` overrides `count` if both are given.",
},
```

- [ ] **Step 10: Add `help` to `userinfo.ts`**

```ts
help: {
	summary: "Display information about a user (account age, join date, roles).",
	examples: ["/userinfo", "/userinfo user:@someone"],
},
```

- [ ] **Step 11: Verify typecheck + lint**

Run: `pnpm check && pnpm build`
Expected: passes.

- [ ] **Step 12: Commit**

```bash
git add src/commands/utility
git commit -m "feat(help): populate help metadata for utility commands"
```

---

## Task 9: Populate — `moderation`

**Files modified:**
- `src/commands/moderation/ban.ts`
- `src/commands/moderation/case.ts`
- `src/commands/moderation/history.ts`
- `src/commands/moderation/kick.ts`
- `src/commands/moderation/mute.ts`
- `src/commands/moderation/purge.ts`
- `src/commands/moderation/unban.ts`
- `src/commands/moderation/unmute.ts`
- `src/commands/moderation/warn.ts`

- [ ] **Step 1: `ban.ts`**

```ts
help: {
	summary: "Ban a member from the server, optionally as a temporary ban.",
	examples: ['/ban user:@spammer reason:"raid"', "/ban user:@x duration:7d"],
},
```

- [ ] **Step 2: `case.ts`**

```ts
help: {
	summary: "View or edit a moderation case.",
	examples: ["/case view number:12", '/case edit number:12 reason:"updated context"'],
	subcommands: {
		view: { summary: "View a specific case by its number.", examples: ["/case view number:5"] },
		edit: { summary: "Edit the reason for an existing case.", examples: ['/case edit number:5 reason:"typo fix"'] },
	},
},
```

- [ ] **Step 3: `history.ts`**

```ts
help: {
	summary: "View moderation history for a user.",
	examples: ["/history user:@someone"],
},
```

- [ ] **Step 4: `kick.ts`**

```ts
help: {
	summary: "Kick a member from the server.",
	examples: ['/kick user:@someone reason:"inappropriate behavior"'],
},
```

- [ ] **Step 5: `mute.ts`**

```ts
help: {
	summary: "Mute a member for a duration.",
	examples: ['/mute user:@x duration:10m reason:"spam"', "/mute user:@y duration:1h"],
},
```

- [ ] **Step 6: `purge.ts`**

```ts
help: {
	summary: "Bulk-delete messages from a channel (optionally filtered by user).",
	examples: ["/purge amount:50", "/purge amount:20 user:@spammer"],
},
```

- [ ] **Step 7: `unban.ts`**

```ts
help: {
	summary: "Unban a user by their user ID.",
	examples: ['/unban user-id:123456789012345678 reason:"appeal accepted"'],
},
```

- [ ] **Step 8: `unmute.ts`**

```ts
help: {
	summary: "Unmute a previously muted member.",
	examples: ['/unmute user:@x reason:"served time"'],
},
```

- [ ] **Step 9: `warn.ts`**

```ts
help: {
	summary: "Warn a member and log the case.",
	examples: ['/warn user:@x reason:"no caps in #general"'],
},
```

- [ ] **Step 10: Verify typecheck + lint**

Run: `pnpm check && pnpm build`

- [ ] **Step 11: Commit**

```bash
git add src/commands/moderation
git commit -m "feat(help): populate help metadata for moderation commands"
```

---

## Task 10: Populate — `config`

**Files modified:**
- `src/commands/config/config.ts`

- [ ] **Step 1: `config.ts`**

```ts
help: {
	summary: "Configure server channels, roles, auto-moderation, and anti-raid settings.",
	examples: [
		"/config view",
		"/config set setting:welcome-channel channel:#welcome",
		"/config automod setting:spam-threshold number:5",
	],
	subcommands: {
		view: { summary: "View current server configuration.", examples: ["/config view"] },
		set: {
			summary: "Set a configuration value for a specific setting.",
			examples: ["/config set setting:log-channel channel:#mod-log", "/config set setting:auto-role role:@Member"],
		},
		automod: {
			summary: "Configure auto-moderation thresholds.",
			examples: ["/config automod setting:spam-threshold number:5"],
		},
		antiraid: {
			summary: "Configure anti-raid protection (join rate limits).",
			examples: ["/config antiraid setting:join-threshold number:10"],
		},
	},
},
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/config
git commit -m "feat(help): populate help metadata for config command"
```

---

## Task 11: Populate — `roles`

**Files modified:**
- `src/commands/roles/reaction-roles.ts`
- `src/commands/roles/role-menu.ts`

- [ ] **Step 1: `reaction-roles.ts`**

```ts
help: {
	summary: "Manage reaction roles — users get a role by reacting to a message.",
	examples: [
		"/reactionrole add message-id:123... emoji:🎮 role:@Gamer",
		"/reactionrole remove message-id:123... emoji:🎮",
	],
	subcommands: {
		add: {
			summary: "Add a reaction role to a message.",
			examples: ["/reactionrole add message-id:123... emoji:🎮 role:@Gamer"],
		},
		remove: {
			summary: "Remove a reaction role from a message.",
			examples: ["/reactionrole remove message-id:123... emoji:🎮"],
		},
	},
},
```

- [ ] **Step 2: `role-menu.ts`**

```ts
help: {
	summary: "Manage role select menus — post a dropdown that grants roles.",
	examples: [
		"/rolemenu create channel:#roles placeholder:\"Pick a color\"",
		"/rolemenu add-option message-id:123... role:@Red label:Red",
	],
	subcommands: {
		create: {
			summary: "Create a role selection menu in a channel.",
			examples: ['/rolemenu create channel:#roles placeholder:"Pick a role"'],
		},
		delete: { summary: "Delete a role menu by message ID.", examples: ["/rolemenu delete message-id:123..."] },
		"add-option": {
			summary: "Add a role option to an existing role menu.",
			examples: ["/rolemenu add-option message-id:123... role:@Red label:Red"],
		},
	},
},
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/roles
git commit -m "feat(help): populate help metadata for roles commands"
```

---

## Task 12: Populate — `leveling`

**Files modified:**
- `src/commands/leveling/leaderboard.ts`
- `src/commands/leveling/rank.ts`
- `src/commands/leveling/reset.ts`
- `src/commands/leveling/rewards.ts`

- [ ] **Step 1: `leaderboard.ts`**

```ts
help: {
	summary: "View the top XP earners in this server.",
	examples: ["/leaderboard", "/leaderboard page:2"],
},
```

- [ ] **Step 2: `rank.ts`**

```ts
help: {
	summary: "View your XP rank or another member's.",
	examples: ["/rank", "/rank user:@someone"],
},
```

- [ ] **Step 3: `reset.ts`**

```ts
help: {
	summary: "Reset a user's XP and level (Admin).",
	examples: ["/level-reset user:@someone"],
},
```

- [ ] **Step 4: `rewards.ts`**

```ts
help: {
	summary: "Manage role rewards granted when members reach specific levels.",
	examples: ["/rewards list", "/rewards add level:10 role:@Regular", "/rewards remove level:10"],
	subcommands: {
		list: { summary: "List all configured level rewards.", examples: ["/rewards list"] },
		add: {
			summary: "Add a role reward for a level (Admin).",
			examples: ["/rewards add level:5 role:@Active"],
		},
		remove: { summary: "Remove a level reward (Admin).", examples: ["/rewards remove level:5"] },
	},
},
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/leveling
git commit -m "feat(help): populate help metadata for leveling commands"
```

---

## Task 13: Populate — `rpg`

**Files modified:**
- `src/commands/rpg/crime.ts`
- `src/commands/rpg/inventory.ts`
- `src/commands/rpg/pet.ts`
- `src/commands/rpg/portrait.ts`
- `src/commands/rpg/profile.ts`
- `src/commands/rpg/property.ts`
- `src/commands/rpg/quests.ts`
- `src/commands/rpg/shop.ts`
- `src/commands/rpg/train.ts`
- `src/commands/rpg/work.ts`

- [ ] **Step 1: `crime.ts`**

```ts
help: {
	summary: "Attempt a criminal activity for big coins — but risk jail.",
	examples: ["/crime job:pickpocket", "/crime job:rob_player target:@someone"],
	usageNotes: "Higher-tier crimes need trained stats. Failing can land you in jail.",
},
```

- [ ] **Step 2: `inventory.ts`**

```ts
help: {
	summary: "View and manage your RPG inventory.",
	examples: ["/inventory view", "/inventory use item:lucky_charm", "/inventory equip item:pickaxe"],
	subcommands: {
		view: { summary: "View your inventory (paginated).", examples: ["/inventory view"] },
		use: {
			summary: "Use a consumable item (e.g. lucky_charm, energy_drink, jail_key).",
			examples: ["/inventory use item:energy_drink"],
		},
		equip: { summary: "Equip a tool item to your tool slot.", examples: ["/inventory equip item:pickaxe"] },
	},
},
```

- [ ] **Step 3: `pet.ts`**

```ts
help: {
	summary: "View, adopt, or rename your RPG pets.",
	examples: ["/pet view", "/pet adopt pet:cat", '/pet rename pet:cat name:"Whiskers"'],
	subcommands: {
		view: { summary: "View all pets you own.", examples: ["/pet view"] },
		adopt: { summary: "Adopt a pet from the market.", examples: ["/pet adopt pet:dog"] },
		rename: {
			summary: "Give a pet a nickname (max 32 chars).",
			examples: ['/pet rename pet:parrot name:"Captain"'],
		},
	},
},
```

- [ ] **Step 4: `portrait.ts`**

```ts
help: {
	summary: "Generate your character portrait via AI (takes a few minutes on CPU).",
	examples: ["/portrait"],
	usageNotes: "Has a cooldown between uses. Image generation runs locally.",
},
```

- [ ] **Step 5: `profile.ts`**

```ts
help: {
	summary: "View your RPG profile or another player's — level, XP, coins, stats, pets.",
	examples: ["/profile", "/profile user:@someone"],
},
```

- [ ] **Step 6: `property.ts`**

```ts
help: {
	summary: "Buy and manage properties for passive hourly income.",
	examples: ["/property view", "/property buy property:apartment", "/property collect"],
	subcommands: {
		view: { summary: "View your owned properties.", examples: ["/property view"] },
		buy: { summary: "Purchase a property (one of each).", examples: ["/property buy property:warehouse"] },
		collect: {
			summary: "Collect accumulated income from all your properties.",
			examples: ["/property collect"],
		},
	},
},
```

- [ ] **Step 7: `quests.ts`**

```ts
help: {
	summary: "View today's daily quests and your progress toward bonus rewards.",
	examples: ["/quests"],
},
```

- [ ] **Step 8: `shop.ts`**

```ts
help: {
	summary: "Browse, buy, or sell RPG items.",
	examples: ["/shop browse", "/shop buy item:lucky_charm", "/shop sell item:rare_gem quantity:2"],
	subcommands: {
		browse: { summary: "Browse available items (paginated).", examples: ["/shop browse"] },
		buy: { summary: "Buy an item from the shop.", examples: ["/shop buy item:energy_drink"] },
		sell: { summary: "Sell an item from your inventory.", examples: ["/shop sell item:rare_gem quantity:1"] },
	},
},
```

- [ ] **Step 9: `train.ts`**

```ts
help: {
	summary: "Train one of your RPG stats. Optionally pay to skip the cooldown.",
	examples: ["/train stat:strength", "/train stat:luck pay:true"],
},
```

- [ ] **Step 10: `work.ts`**

```ts
help: {
	summary: "Do a job to earn coins.",
	examples: ["/work job:delivery", "/work job:miner"],
	usageNotes: "Each job has its own cooldown and may require certain stats.",
},
```

- [ ] **Step 11: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/rpg
git commit -m "feat(help): populate help metadata for rpg commands"
```

---

## Task 14: Populate — `fun`

**Files modified:**
- `src/commands/fun/8ball.ts`
- `src/commands/fun/choose.ts`
- `src/commands/fun/coinflip.ts`
- `src/commands/fun/meme.ts`
- `src/commands/fun/pfp-edit.ts`
- `src/commands/fun/poll.ts`

- [ ] **Step 1: `8ball.ts`**

```ts
help: {
	summary: "Ask the magic 8-ball a yes/no question.",
	examples: ['/8ball question:"Will I win the lottery?"'],
},
```

- [ ] **Step 2: `choose.ts`**

```ts
help: {
	summary: "Let the bot pick from a comma-separated list of options.",
	examples: ['/choose options:"pizza, sushi, tacos"'],
},
```

- [ ] **Step 3: `coinflip.ts`**

```ts
help: {
	summary: "Flip a coin — heads or tails.",
	examples: ["/coinflip"],
},
```

- [ ] **Step 4: `meme.ts`**

```ts
help: {
	summary: "Fetch a random meme from Reddit.",
	examples: ["/meme"],
},
```

- [ ] **Step 5: `pfp-edit.ts`**

```ts
help: {
	summary: "Transform a user's avatar using AI image generation.",
	examples: ["/pfp-edit effect:oil_painting", '/pfp-edit user:@someone prompt:"cyberpunk neon"'],
	usageNotes: "Custom prompts require a trusted role. CPU image generation can take up to 5 minutes.",
},
```

- [ ] **Step 6: `poll.ts`**

```ts
help: {
	summary: "Create a poll with up to 4 options.",
	examples: ['/poll question:"Pizza or tacos?" option1:Pizza option2:Tacos duration:60'],
	usageNotes: "Duration is in minutes; 0 means no expiry.",
},
```

- [ ] **Step 7: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/fun
git commit -m "feat(help): populate help metadata for fun commands"
```

---

## Task 15: Populate — `music`

**Files modified:**
- `src/commands/music/controls.ts`
- `src/commands/music/loop.ts`
- `src/commands/music/nowplaying.ts`
- `src/commands/music/play.ts`
- `src/commands/music/queue.ts`
- `src/commands/music/shuffle.ts`
- `src/commands/music/volume.ts`

- [ ] **Step 1: `controls.ts`**

```ts
help: {
	summary: "Music playback controls — pause, resume, skip, stop, disconnect.",
	examples: ["/music pause", "/music resume", "/music skip", "/music stop", "/music disconnect"],
	subcommands: {
		pause: { summary: "Pause the current song.", examples: ["/music pause"] },
		resume: { summary: "Resume playback.", examples: ["/music resume"] },
		skip: { summary: "Skip the current song.", examples: ["/music skip"] },
		stop: { summary: "Stop music and clear the queue.", examples: ["/music stop"] },
		disconnect: { summary: "Disconnect the bot from voice.", examples: ["/music disconnect"] },
	},
},
```

- [ ] **Step 2: `loop.ts`**

```ts
help: {
	summary: "Set the loop mode for music playback.",
	examples: ["/loop mode:track", "/loop mode:queue", "/loop mode:off"],
},
```

- [ ] **Step 3: `nowplaying.ts`**

```ts
help: {
	summary: "Show the currently playing song.",
	examples: ["/nowplaying"],
},
```

- [ ] **Step 4: `play.ts`**

```ts
help: {
	summary: "Play a song or playlist from a URL or search query.",
	examples: ['/play query:"lo-fi beats"', "/play query:https://youtu.be/dQw4w9WgXcQ"],
},
```

- [ ] **Step 5: `queue.ts`**

```ts
help: {
	summary: "Show the current music queue.",
	examples: ["/queue", "/queue page:2"],
},
```

- [ ] **Step 6: `shuffle.ts`**

```ts
help: {
	summary: "Shuffle the music queue.",
	examples: ["/shuffle"],
},
```

- [ ] **Step 7: `volume.ts`**

```ts
help: {
	summary: "Set the music volume (0–100).",
	examples: ["/volume level:50"],
},
```

- [ ] **Step 8: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/music
git commit -m "feat(help): populate help metadata for music commands"
```

---

## Task 16: Populate — `giveaway`

**Files modified:**
- `src/commands/giveaway/giveaway.ts`

- [ ] **Step 1: `giveaway.ts`**

```ts
help: {
	summary: "Start, end, or reroll giveaways.",
	examples: [
		'/giveaway start duration:1h prize:"Nitro" winners:1',
		"/giveaway end message-id:123...",
		"/giveaway reroll message-id:123...",
	],
	subcommands: {
		start: {
			summary: "Start a giveaway with a duration and prize.",
			examples: ['/giveaway start duration:24h prize:"Steam Key" winners:2'],
		},
		end: { summary: "End a running giveaway early.", examples: ["/giveaway end message-id:123..."] },
		reroll: {
			summary: "Reroll winners for an already-ended giveaway.",
			examples: ["/giveaway reroll message-id:123..."],
		},
	},
},
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/giveaway
git commit -m "feat(help): populate help metadata for giveaway command"
```

---

## Task 17: Populate — `suggestions`

**Files modified:**
- `src/commands/suggestions/suggest.ts`
- `src/commands/suggestions/suggestion.ts`

- [ ] **Step 1: `suggest.ts`**

```ts
help: {
	summary: "Submit a suggestion for the server.",
	examples: ['/suggest idea:"Add a #pets channel"'],
},
```

- [ ] **Step 2: `suggestion.ts`**

```ts
help: {
	summary: "Approve or deny community suggestions (mod/admin).",
	examples: ['/suggestion approve id:5 response:"great idea!"', '/suggestion deny id:6 reason:"duplicate"'],
	subcommands: {
		approve: {
			summary: "Approve a suggestion with an optional response.",
			examples: ['/suggestion approve id:5 response:"shipping soon!"'],
		},
		deny: {
			summary: "Deny a suggestion with an optional reason.",
			examples: ['/suggestion deny id:6 reason:"out of scope"'],
		},
	},
},
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/suggestions
git commit -m "feat(help): populate help metadata for suggestions commands"
```

---

## Task 18: Populate — `tickets`

**Files modified:**
- `src/commands/tickets/ticket-panel.ts`
- `src/commands/tickets/ticket.ts`

- [ ] **Step 1: `ticket-panel.ts`**

```ts
help: {
	summary: "Post a ticket creation panel in a channel (Admin).",
	examples: ['/ticket-panel channel:#support title:"Need help?"'],
},
```

- [ ] **Step 2: `ticket.ts`**

```ts
help: {
	summary: "Open, claim, or manage support tickets.",
	examples: ['/ticket open subject:"payment issue"', "/ticket close", "/ticket claim", "/ticket add user:@mod"],
	subcommands: {
		open: {
			summary: "Open a new support ticket with an optional subject.",
			examples: ['/ticket open subject:"bug report"'],
		},
		close: { summary: "Close the current ticket channel.", examples: ["/ticket close"] },
		claim: { summary: "Claim this ticket as yours.", examples: ["/ticket claim"] },
		add: { summary: "Add a user to this ticket.", examples: ["/ticket add user:@helper"] },
		remove: { summary: "Remove a user from this ticket.", examples: ["/ticket remove user:@x"] },
		transcript: {
			summary: "Save and send a transcript of the ticket.",
			examples: ["/ticket transcript"],
		},
	},
},
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/tickets
git commit -m "feat(help): populate help metadata for tickets commands"
```

---

## Task 19: Populate — `autorespond`

**Files modified:**
- `src/commands/autorespond/autorespond.ts`

- [ ] **Step 1: `autorespond.ts`**

```ts
help: {
	summary: "Manage auto-responses — static replies or LLM-generated answers.",
	examples: [
		'/autorespond add trigger:"hello" response:"hey there!"',
		'/autorespond add trigger:"weather" response:"you are a helpful weather bot" use-llm:true',
		'/autorespond remove trigger:"hello"',
		"/autorespond list",
	],
	subcommands: {
		add: {
			summary: "Add an auto-response trigger. If use-llm is true, response is the LLM system prompt.",
			examples: ['/autorespond add trigger:"gm" response:"Good morning!"'],
		},
		remove: {
			summary: "Remove an auto-response by its trigger text.",
			examples: ['/autorespond remove trigger:"gm"'],
		},
		list: { summary: "List all configured auto-responses.", examples: ["/autorespond list"] },
	},
},
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm check && pnpm build
git add src/commands/autorespond
git commit -m "feat(help): populate help metadata for autorespond command"
```

---

## Task 20: End-to-end manual verification

**No files modified.** This task is the final acceptance gate.

Prerequisites: `DISCORD_TOKEN`, `DATABASE_URL`, and (optionally) `VALKEY_URL`/`OLLAMA_URL` set in `.env`. The Discord application must have `applications.commands` scope in the test server.

- [ ] **Step 1: Start the bot**

Run: `pnpm dev`
Expected: bot comes online; logs show `[help] Command "xyz" is missing a help field` only if a command was missed during populate tasks. If any fallback warnings appear, go back and add `help` to those commands, then return here.

- [ ] **Step 2: Register slash commands**

Slash commands register automatically on startup in development. Wait until Discord shows `/help` in the command picker (~30s).

- [ ] **Step 3: Overview**

In the test server, run `/help`.
Expected: ephemeral reply with a "📖 Bot Commands" embed showing all 12 categories. A "Jump to a category…" dropdown is present.

- [ ] **Step 4: Direct entry**

Run `/help category:rpg`.
Expected: jumps straight to the ⚔️ RPG & Economy page (no overview shown first).

- [ ] **Step 5: Autocomplete**

Type `/help category:mo` and wait for autocomplete.
Expected: "🛡️ Moderation" appears as a suggestion.

- [ ] **Step 6: Pagination**

From `/help category:rpg`, verify footer shows `Page 1/2 · 10 commands` (or `9 commands` — depends on your migration state). Click `Next ▶`.
Expected: advances to page 2. `Next ▶` is disabled on the last page; `◀ Prev` is disabled on page 1.

- [ ] **Step 7: Single-page category**

Run `/help category:giveaway` (has a single command).
Expected: no `◀ Prev`/`Next ▶` buttons shown; only `⬅ Overview`.

- [ ] **Step 8: Command detail**

From the RPG category page, use the "View details…" dropdown to select `/shop`.
Expected: command detail embed with description, examples, and one field per subcommand (`/shop browse`, `/shop buy`, `/shop sell`) each showing their examples.

- [ ] **Step 9: Permission markers**

From the Moderation category, check that `/ban` is rendered as `🛡️ /ban`. Run `/help` and drill into Config — `/config` should show `⚙️`. Drill into Music — `/play` should show `🎧`.

- [ ] **Step 10: Back-to-category preserves page**

From RPG category page 2 (click `Next ▶` first), open `/work` detail, then click `⬅ Back to RPG & Economy`.
Expected: returns to page 2 of RPG, not page 1.

- [ ] **Step 11: Overview button from detail**

On any command detail page, click `⬅ Overview`.
Expected: returns to the overview.

- [ ] **Step 12: Stale message after restart**

Leave the ephemeral help open, stop the bot (Ctrl-C), restart with `pnpm dev`, and click a button on the old message.
Expected: nothing visible happens in the UI (Discord reports the interaction failed); bot logs show a debug line `[help] button update failed:`. No crash, no unhandled rejection.

- [ ] **Step 13: Run full static checks one more time**

Run: `pnpm check && pnpm build`
Expected: passes cleanly.

- [ ] **Step 14: Commit any final fixes (if needed)**

If manual verification surfaced issues that required code changes, commit them under `fix(help): ...` messages. Otherwise, the plan is complete — no further commits needed.

---

## Done criteria

All 20 tasks checked. Manual verification steps pass without error. Running `pnpm check && pnpm build` is clean. `/help` works as specified: overview with 12 categories, direct-entry via `/help category:<id>`, ephemeral responses, three-level drill-in, pagination in RPG, permission markers on gated commands, graceful fallbacks for stale/unknown interactions.
