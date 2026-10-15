import { container, Events, SapphireClient } from "@sapphire/framework";
import "@sapphire/plugin-subcommands/register";
import { SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
	has: () => true,
	trace: vi.fn(),
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	fatal: vi.fn(),
	write: vi.fn(),
}));

// Real client with Sapphire's built-in and plugin error listeners loaded, plus our listeners, as at runtime.
describe("error listeners", () => {
	let client: SapphireClient;

	beforeAll(async () => {
		client = new SapphireClient({ intents: [], logger: { instance: logger as any } });
		const { CommandErrorListener } = await import("../../../src/listeners/commands/commandError.js");
		const { SubcommandErrorListener } = await import("../../../src/listeners/commands/subcommandError.js");
		const { InteractionHandlerErrorListener } = await import(
			"../../../src/listeners/commands/interactionHandlerError.js"
		);
		const { InteractionHandlerParseErrorListener } = await import(
			"../../../src/listeners/commands/interactionHandlerParseError.js"
		);
		const store = container.stores.get("listeners");
		const ours = {
			CommandErrorListener,
			SubcommandErrorListener,
			InteractionHandlerErrorListener,
			InteractionHandlerParseErrorListener,
		};
		for (const [name, piece] of Object.entries(ours)) {
			await store.loadPiece({ name, piece: piece as any, store: "listeners" });
		}
		await store.loadAll();
	});

	afterAll(() => {
		client.removeAllListeners();
	});

	const command = { name: "ping", location: { full: "/src/commands/ping.ts" } };
	const handler = { name: "musicButtons", location: { full: "/src/interaction-handlers/musicButtons.ts" } };
	const interaction = { isRepliable: () => false };

	it.each([
		[Events.ChatInputCommandError, { interaction, command, duration: 1 }],
		[SubcommandPluginEvents.ChatInputSubcommandError, { interaction, command }],
		[Events.InteractionHandlerError, { interaction, handler }],
		[Events.InteractionHandlerParseError, { interaction, handler }],
	])("%s is logged exactly once, with a reference", async (event, payload) => {
		logger.error.mockClear();
		const error = new Error("boom");

		client.emit(event as any, error, payload as any);
		await new Promise((resolve) => setImmediate(resolve));

		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/Reference [0-9a-f]{6}/), error);
	});
});
