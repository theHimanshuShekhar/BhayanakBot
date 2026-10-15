import type { Command } from "@sapphire/framework";
import { container } from "@sapphire/framework";
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
	// For src/commands/fun/poll.ts, directories = ["fun"].
	const dirs = cmd.location.directories;
	if (dirs.length === 0) return null;
	return dirs[0] ?? null;
}

function preconditionNames(cmd: Command): string[] {
	const precondArr = cmd.options.preconditions as readonly (string | { name: string })[] | undefined;
	return (precondArr ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name));
}

function markersFor(cmd: Command): string[] {
	const out: string[] = [];
	for (const name of preconditionNames(cmd)) {
		const marker = PRECONDITION_MARKERS[name];
		if (marker && !out.includes(marker)) out.push(marker);
	}
	return out;
}

/**
 * The name members type, taken from what the command registered with Discord. The piece name
 * (file name or constructor `name`) is only a store key and can differ, e.g. `reset` vs `/level-reset`.
 */
function registeredName(cmd: Command): string | null {
	return cmd.applicationCommandRegistry.chatInputCommands.values().next().value ?? null;
}

export function collectHelpSnapshot(commands: Iterable<Command>): HelpSnapshot {
	const commandsByCategory = new Map<string, CollectedCommand[]>();
	const commandByName = new Map<string, CollectedCommand>();

	for (const cmd of commands) {
		const name = registeredName(cmd);
		const categoryId = resolveCategoryId(cmd);
		if (!name || !categoryId || !CATEGORIES.find((c) => c.id === categoryId)) continue;

		const fromOptions = cmd.options.help;
		const isFallback = !fromOptions;
		const baseHelp: CommandHelp = fromOptions ?? {
			summary: cmd.description || "(no description)",
			examples: [],
		};
		// Home-Server Features are registered as guild commands there only, so members elsewhere cannot run them.
		const help = preconditionNames(cmd).includes("HomeServerOnly")
			? { ...baseHelp, summary: `${baseHelp.summary} (Bhayanak server only)` }
			: baseHelp;

		if (isFallback) {
			container.logger.debug(`[help] Command "${name}" is missing a help field; using fallback.`);
		}

		const entry: CollectedCommand = {
			name,
			categoryId,
			help,
			markers: markersFor(cmd),
			isFallback,
		};
		commandByName.set(name, entry);
		const list = commandsByCategory.get(categoryId) ?? [];
		list.push(entry);
		commandsByCategory.set(categoryId, list);
	}

	// Sort each category's commands alphabetically by name for stable rendering.
	for (const list of commandsByCategory.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}

	// Categories whose pieces are disabled by src/lib/features.ts have no loaded
	// commands — omit them so help only advertises what can actually run.
	const categories = CATEGORIES.filter((category) => (commandsByCategory.get(category.id)?.length ?? 0) > 0);

	return {
		categories,
		commandsByCategory,
		commandByName,
	};
}

export function getHelpSnapshot(): HelpSnapshot {
	if (!cached) cached = collectHelpSnapshot(container.stores.get("commands").values());
	return cached;
}

export function resetHelpSnapshot(): void {
	cached = null;
}
