import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "@sapphire/framework";
import { SlashCommandBuilder } from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import { TARGET_GUILD_ID } from "../../../src/lib/constants.js";
import { GUESS_WHO_MAX_WRONG_GUESSES } from "../../../src/lib/guessWho/session.js";
import { createCommandContext, loadCommandClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

function discoverCommandFiles(): string[] {
	const root = fileURLToPath(new URL("../../../src/commands", import.meta.url));
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
				const rel = relative(root, fullPath).split(sep).join("/").replace(/\.ts$/, ".js");
				files.push(`../../../src/commands/${rel}`);
			}
		}
	};
	walk(root);
	return files.sort();
}

const commandFiles = discoverCommandFiles();

const knownPreconditions = [
	"GuildOnly",
	"HomeServerOnly",
	"IsAdmin",
	"IsModerator",
	"IsDJ",
	"InBotVoiceChannel",
	"Cooldown",
];

function getPreconditionName(precondition: unknown): unknown {
	if (typeof precondition === "string") return precondition;
	if (precondition && typeof precondition === "object" && "name" in precondition) return precondition.name;
	return precondition;
}

describe("command structure", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	for (const file of commandFiles) {
		const name = file.split("/").pop()?.replace(".js", "") ?? file;

		it(`${name} exports a Command subclass`, async () => {
			const CommandClass = await loadCommandClass(file);
			expect(CommandClass.prototype).toBeInstanceOf(Command);
		});

		it(`${name} instantiates without errors`, async () => {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			expect(instance).toBeInstanceOf(Command);
			expect(instance.name).toBeTruthy();
		});

		it(`${name} has registerApplicationCommands and chatInputRun`, async () => {
			const CommandClass = await loadCommandClass(file);
			expect(typeof CommandClass.prototype.registerApplicationCommands).toBe("function");
			expect(typeof CommandClass.prototype.chatInputRun).toBe("function");
		});
	}

	it("all command files are accounted for", () => {
		expect(commandFiles.length).toBeGreaterThan(0);
	});

	it("does not ship the removed ticket, role menu, reaction role, or suggestion commands", () => {
		const removed = ["ticket", "ticket-panel", "role-menu", "reaction-roles", "suggest", "suggestion"];
		const names = commandFiles.map((file) => file.split("/").pop()?.replace(".js", ""));
		for (const name of removed) {
			expect(names).not.toContain(name);
		}
	});
});

describe("command preconditions", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	it("music commands require IsDJ precondition", async () => {
		const musicCommands = [
			"../../../src/commands/music/play.js",
			"../../../src/commands/music/controls.js",
			"../../../src/commands/music/volume.js",
			"../../../src/commands/music/shuffle.js",
			"../../../src/commands/music/loop.js",
		];
		for (const file of musicCommands) {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			const names = instance.preconditions.entries.map(getPreconditionName);
			expect(names).toContain("IsDJ");
		}
	});

	it("playback controls require the bot's voice channel, read-only music commands do not", async () => {
		const load = async (file: string) => {
			const CommandClass = await loadCommandClass(`../../../src/commands/music/${file}.js`);
			const context = createCommandContext(`src/commands/music/${file}.ts`);
			return new CommandClass(context, {}).preconditions.entries.map(getPreconditionName);
		};
		for (const file of ["controls", "volume", "shuffle", "loop"]) {
			expect(await load(file), file).toContain("InBotVoiceChannel");
		}
		// /play applies the same check itself so it can say "join the voice channel" first and let an idle bot join
		for (const file of ["play", "queue", "nowplaying"]) {
			expect(await load(file), file).not.toContain("InBotVoiceChannel");
		}
	});

	it("moderation commands require IsModerator precondition", async () => {
		const modCommands = [
			"../../../src/commands/moderation/ban.js",
			"../../../src/commands/moderation/kick.js",
			"../../../src/commands/moderation/mute.js",
			"../../../src/commands/moderation/unmute.js",
			"../../../src/commands/moderation/warn.js",
			"../../../src/commands/moderation/unban.js",
			"../../../src/commands/moderation/purge.js",
			"../../../src/commands/moderation/case.js",
			"../../../src/commands/moderation/history.js",
		];
		for (const file of modCommands) {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			const names = instance.preconditions.entries.map(getPreconditionName);
			expect(names).toContain("IsModerator");
		}
	});

	it("all precondition names map to known preconditions", async () => {
		for (const file of commandFiles) {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			const names = instance.preconditions.entries.map(getPreconditionName);
			for (const name of names) {
				if (typeof name === "string") {
					expect(knownPreconditions).toContain(name);
				}
			}
		}
	});
});

describe("Home-Server Feature commands", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	const homeServerCommands = [
		{ name: "summarize", file: "../../../src/commands/utility/summarize.js" },
		{ name: "personality", file: "../../../src/commands/utility/personality.js" },
		{ name: "guess_who", file: "../../../src/commands/games/guess-who.js" },
	];

	async function inspectCommand(file: string) {
		const CommandClass = await loadCommandClass(file);
		const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
		const instance = new CommandClass(context, {});
		const registrations: { name: string; options: { guildIds?: string[] } | undefined }[] = [];
		instance.registerApplicationCommands({
			registerChatInputCommand(register: (builder: SlashCommandBuilder) => unknown, options?: { guildIds?: string[] }) {
				const json = (register(new SlashCommandBuilder()) as SlashCommandBuilder).toJSON();
				registrations.push({ name: json.name, options });
			},
		} as never);
		return { instance, registrations };
	}

	for (const { name, file } of homeServerCommands) {
		it(`/${name} is registered as a guild command in the Home Server only`, async () => {
			const { registrations } = await inspectCommand(file);
			expect(registrations).toHaveLength(1);
			expect(registrations[0]?.name).toBe(name);
			expect(registrations[0]?.options?.guildIds).toEqual([TARGET_GUILD_ID]);
		});

		it(`/${name} refuses to run outside the Home Server`, async () => {
			const { instance } = await inspectCommand(file);
			expect(instance.preconditions.entries.map(getPreconditionName)).toContain("HomeServerOnly");
		});
	}

	it("every other command stays globally registered", async () => {
		const homeFiles = new Set(homeServerCommands.map((c) => c.file));
		for (const file of commandFiles.filter((f) => !homeFiles.has(f))) {
			const { registrations } = await inspectCommand(file);
			for (const registration of registrations) {
				expect(registration.options?.guildIds, `${registration.name} must stay a global command`).toBeUndefined();
			}
		}
	});
});

describe("autorespond command metadata", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	it("describes LLM auto-responses as provider-backed instead of Ollama-specific", async () => {
		const CommandClass = await loadCommandClass("../../../src/commands/autorespond/autorespond.js");
		const instance = new CommandClass(createCommandContext("src/commands/autorespond/autorespond.ts"), {});
		let commandJson: ReturnType<SlashCommandBuilder["toJSON"]> | undefined;

		instance.registerApplicationCommands({
			registerChatInputCommand(register) {
				const builder = new SlashCommandBuilder();
				commandJson = register(builder).toJSON();
			},
		} as never);

		expect(JSON.stringify(commandJson)).not.toMatch(/Ollama/i);
		expect(JSON.stringify(commandJson)).toMatch(/configured AI provider/i);
	});
});

describe("guess who embeds", () => {
	const archivedMessage = {
		messageId: "message-1",
		guildId: "guild-1",
		channelId: "channel-1",
		authorUserId: "author-1",
		authorUsername: "author_name",
		authorDisplayName: "Author Display",
		content: "This is the archived message to guess.",
		messageCreatedAt: new Date("2025-01-01T00:00:00.000Z"),
		editedAt: null,
		deletedAt: null,
		createdAt: new Date("2025-01-01T00:00:00.000Z"),
		updatedAt: new Date("2025-01-01T00:00:00.000Z"),
	};

	it("builds a prompt embed with quote and remaining guesses", async () => {
		const { buildGuessWhoPromptEmbed } = await import("../../../src/lib/guessWho/embeds.js");

		const embed = buildGuessWhoPromptEmbed(archivedMessage).toJSON();

		expect(embed.title).toBe("Guess Who?");
		expect(embed.description).toBe("> This is the archived message to guess.");
		expect(embed.fields).toContainEqual({ name: "How to play", value: "Mention the user who sent this message." });
		expect(embed.footer?.text).toBe(`${GUESS_WHO_MAX_WRONG_GUESSES} guesses remaining`);
	});

	it("builds a reveal embed with source details and outcome", async () => {
		const { buildGuessWhoRevealEmbed } = await import("../../../src/lib/guessWho/embeds.js");

		const embed = buildGuessWhoRevealEmbed({
			message: archivedMessage,
			outcome: "correct",
			guessedByUserId: "guesser-1",
		}).toJSON();

		expect(embed.title).toBe("Correct Guess!");
		expect(embed.description).toBe("> This is the archived message to guess.");
		expect(embed.fields).toEqual(
			expect.arrayContaining([
				{ name: "Author", value: "<@author-1> (Author Display)", inline: true },
				{ name: "Sent", value: "<t:1735689600:R>", inline: true },
				{ name: "Message ID", value: "message-1", inline: false },
				{
					name: "Source",
					value: "[Jump to message](https://discord.com/channels/guild-1/channel-1/message-1)",
					inline: false,
				},
				{ name: "Outcome", value: "<@guesser-1> guessed correctly.", inline: false },
			]),
		);
	});
});
