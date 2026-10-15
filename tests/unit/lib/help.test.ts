import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "@sapphire/framework";
import { SlashCommandBuilder } from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import { CATEGORIES } from "../../../src/lib/help/categories.js";
import { collectHelpSnapshot, type HelpSnapshot } from "../../../src/lib/help/collect.js";
import { loadCommandClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const commandsRoot = fileURLToPath(new URL("../../../src/commands", import.meta.url));

function discoverCommandFiles(dir = commandsRoot): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) return discoverCommandFiles(fullPath);
		return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [fullPath] : [];
	});
}

/** Instantiate a command the way Sapphire's loader does, with its location relative to src/commands. */
async function loadCommand(file: string): Promise<Command> {
	const CommandClass = await loadCommandClass(file);
	const name = relative(commandsRoot, file).split(sep).pop()?.replace(/\.ts$/, "") ?? file;
	return new CommandClass({ store: {} as never, path: file, root: commandsRoot, name } as never, {});
}

/** Every chat input name the command registers, read straight from its builders. */
function builderNames(command: Command): string[] {
	const names: string[] = [];
	command.registerApplicationCommands?.({
		registerChatInputCommand(register: (builder: SlashCommandBuilder) => SlashCommandBuilder) {
			names.push(register(new SlashCommandBuilder()).toJSON().name);
		},
	} as never);
	return names;
}

describe("help", () => {
	let commands: Command[];
	let snapshot: HelpSnapshot;
	const registeredNames = new Set<string>();

	beforeAll(async () => {
		setupSapphireContainer();
		commands = await Promise.all(discoverCommandFiles().map(loadCommand));
		// Sapphire fills each command's application command registry on startup; do the same here.
		for (const command of commands) {
			await command.registerApplicationCommands?.(command.applicationCommandRegistry);
			for (const name of builderNames(command)) registeredNames.add(name);
		}
		snapshot = collectHelpSnapshot(commands);
	});

	it("lists exactly the registered chat input names of every loaded command", () => {
		expect(commands.length).toBeGreaterThan(0);
		expect([...snapshot.commandByName.keys()].sort()).toEqual([...registeredNames].sort());
	});

	it("uses the registered name where the piece name differs", () => {
		const names = new Set(snapshot.commandByName.keys());
		for (const registered of ["level-reset", "music", "guess_who"]) expect(names).toContain(registered);
		for (const stale of ["reset", "controls", "guess-who", "status"]) expect(names).not.toContain(stale);
	});

	it("files every loaded command under a category", () => {
		const listed = [...snapshot.commandsByCategory.values()].flat();
		expect(listed).toHaveLength(commands.length);
		for (const command of commands) {
			expect(
				CATEGORIES.map((c) => c.id),
				`${command.location.full} has no help category`,
			).toContain(command.location.directories[0]);
		}
	});

	it("lists /minecraft under Game Servers", () => {
		const gameServers = snapshot.categories.find((c) => c.label === "Game Servers");
		expect(gameServers).toBeDefined();
		const names = snapshot.commandsByCategory.get(gameServers?.id ?? "")?.map((c) => c.name);
		expect(names).toEqual(["minecraft"]);
	});

	it("only shows examples that start with a registered command", () => {
		for (const entry of snapshot.commandByName.values()) {
			const examples = [
				...entry.help.examples,
				...Object.values(entry.help.subcommands ?? {}).flatMap((sub) => sub.examples),
			];
			for (const example of examples) {
				const used = /^\/([\w-]+)/.exec(example)?.[1];
				expect(registeredNames, `/${entry.name} example "${example}"`).toContain(used);
			}
		}
	});

	it("marks Home-Server Features as Bhayanak server only", () => {
		for (const name of ["summarize", "personality", "guess_who"]) {
			expect(snapshot.commandByName.get(name)?.help.summary, name).toMatch(/\(Bhayanak server only\)$/);
		}
		expect(snapshot.commandByName.get("ping")?.help.summary).not.toMatch(/Bhayanak server only/);
	});
});
