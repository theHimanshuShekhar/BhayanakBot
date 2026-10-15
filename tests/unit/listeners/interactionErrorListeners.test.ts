import { Events, UserError } from "@sapphire/framework";
import { SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createListenerContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const reportInteractionErrorMock = vi.hoisted(() => vi.fn());
const reportInteractionDeniedMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/interactionErrors.js", () => ({
	reportInteractionError: reportInteractionErrorMock,
	reportInteractionDenied: reportInteractionDeniedMock,
}));

const interaction = { id: "interaction" } as any;
const error = new Error("boom");

const modules: Record<string, () => Promise<Record<string, any>>> = {
	commandError: () => import("../../../src/listeners/commands/commandError.js"),
	commandDenied: () => import("../../../src/listeners/commands/commandDenied.js"),
	subcommandError: () => import("../../../src/listeners/commands/subcommandError.js"),
	subcommandDenied: () => import("../../../src/listeners/commands/subcommandDenied.js"),
	interactionHandlerError: () => import("../../../src/listeners/commands/interactionHandlerError.js"),
	interactionHandlerParseError: () => import("../../../src/listeners/commands/interactionHandlerParseError.js"),
};

async function load(file: string, exportName: string) {
	const mod = await (modules[file] as () => Promise<Record<string, any>>)();
	return new mod[exportName](createListenerContext(`src/listeners/commands/${file}.ts`), {});
}

describe("interaction error listeners", () => {
	beforeEach(() => {
		setupSapphireContainer();
		reportInteractionErrorMock.mockReset();
		reportInteractionDeniedMock.mockReset();
	});

	it.each([
		["commandError", "CommandErrorListener", Events.ChatInputCommandError, { command: { name: "ping" } }],
		[
			"subcommandError",
			"SubcommandErrorListener",
			SubcommandPluginEvents.ChatInputSubcommandError,
			{ command: { name: "config" } },
		],
		[
			"interactionHandlerError",
			"InteractionHandlerErrorListener",
			Events.InteractionHandlerError,
			{ handler: { name: "musicButtons" } },
		],
		[
			"interactionHandlerParseError",
			"InteractionHandlerParseErrorListener",
			Events.InteractionHandlerParseError,
			{ handler: { name: "musicButtons" } },
		],
	])("%s reports unexpected errors with a reference", async (file, exportName, event, extra) => {
		const listener = await load(file, exportName);
		expect(listener.event).toBe(event);

		await listener.run(error, { interaction, ...extra });

		expect(reportInteractionErrorMock).toHaveBeenCalledOnce();
		const [calledInteraction, calledError, source] = reportInteractionErrorMock.mock.calls[0] as [
			unknown,
			unknown,
			string,
		];
		expect(calledInteraction).toBe(interaction);
		expect(calledError).toBe(error);
		expect(source).toContain((extra as any).command?.name ?? (extra as any).handler.name);
	});

	it.each([
		["commandDenied", "CommandDeniedListener", Events.ChatInputCommandDenied],
		["subcommandDenied", "SubcommandDeniedListener", SubcommandPluginEvents.ChatInputSubcommandDenied],
	])("%s shows the precondition message", async (file, exportName, event) => {
		const listener = await load(file, exportName);
		expect(listener.event).toBe(event);

		await listener.run(new UserError({ identifier: "denied", message: "You need Administrator permission." }), {
			interaction,
		});

		expect(reportInteractionDeniedMock).toHaveBeenCalledWith(interaction, "You need Administrator permission.");
	});
});
