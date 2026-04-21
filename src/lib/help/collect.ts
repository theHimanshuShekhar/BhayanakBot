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
