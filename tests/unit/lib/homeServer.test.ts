import { describe, expect, it, vi } from "vitest";
import { TARGET_GUILD_ID } from "../../../src/lib/constants.js";
import {
	HOME_SERVER_COMMAND_NAMES,
	isHomeServer,
	removeGlobalHomeServerCommands,
} from "../../../src/lib/homeServer.js";
import { HomeServerOnlyPrecondition } from "../../../src/preconditions/HomeServerOnly.js";
import { createPreconditionContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

describe("isHomeServer", () => {
	it("is true only for the target guild", () => {
		expect(isHomeServer(TARGET_GUILD_ID)).toBe(true);
		expect(isHomeServer("some-other-guild")).toBe(false);
		expect(isHomeServer(null)).toBe(false);
		expect(isHomeServer(undefined)).toBe(false);
	});
});

describe("HomeServerOnly precondition", () => {
	setupSapphireContainer();
	const precondition = new HomeServerOnlyPrecondition(
		createPreconditionContext("src/preconditions/HomeServerOnly.ts"),
		{},
	);

	it("allows the Home Server and refuses every other guild and DMs", () => {
		expect(precondition.chatInputRun({ guildId: TARGET_GUILD_ID } as never).isOk()).toBe(true);

		const other = precondition.chatInputRun({ guildId: "some-other-guild" } as never);
		expect(other.isErr()).toBe(true);
		expect(other.isErr() && other.unwrapErr().message).toBe("This command is only available in the Bhayanak server.");

		expect(precondition.chatInputRun({ guildId: null } as never).isErr()).toBe(true);
	});
});

describe("removeGlobalHomeServerCommands", () => {
	const logger = () => ({ info: vi.fn(), warn: vi.fn() });

	it("deletes only the stale global Home-Server commands", async () => {
		const existing = [
			...HOME_SERVER_COMMAND_NAMES.map((name, i) => [`id-${i}`, { id: `id-${i}`, name }] as const),
			["keep-1", { id: "keep-1", name: "ping" }] as const,
			["keep-2", { id: "keep-2", name: "play" }] as const,
		];
		const commands = { fetch: vi.fn(async () => new Map(existing)), delete: vi.fn(async () => undefined) };

		await removeGlobalHomeServerCommands(commands as never, logger());

		expect(commands.delete.mock.calls.map(([id]) => id).sort()).toEqual(["id-0", "id-1", "id-2"]);
	});

	it("does nothing when no stale global command exists", async () => {
		const commands = {
			fetch: vi.fn(async () => new Map([["keep", { id: "keep", name: "ping" }]])),
			delete: vi.fn(),
		};

		await removeGlobalHomeServerCommands(commands as never, logger());

		expect(commands.delete).not.toHaveBeenCalled();
	});

	it("logs instead of throwing when Discord fails", async () => {
		const log = logger();
		const commands = {
			fetch: vi.fn(async () => {
				throw new Error("discord down");
			}),
			delete: vi.fn(),
		};

		await expect(removeGlobalHomeServerCommands(commands as never, log)).resolves.toBeUndefined();
		expect(log.warn).toHaveBeenCalledTimes(1);
	});
});
