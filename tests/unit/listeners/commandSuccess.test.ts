import { Events } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createListenerContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const incrementCommandsRunMock = vi.hoisted(() => vi.fn<() => Promise<number>>());

vi.mock("../../../src/db/queries/publicStats.js", () => ({
	incrementCommandsRun: incrementCommandsRunMock,
}));

describe("CommandSuccessListener", () => {
	beforeEach(() => {
		setupSapphireContainer();
		incrementCommandsRunMock.mockReset();
	});

	it("increments the public command counter after a successful chat input command", async () => {
		incrementCommandsRunMock.mockResolvedValue(1);
		const { CommandSuccessListener } = await import("../../../src/listeners/commands/commandSuccess.js");
		const listener = new CommandSuccessListener(createListenerContext("src/listeners/commands/commandSuccess.ts"), {});

		await listener.run();

		expect(listener.event).toBe(Events.ChatInputCommandSuccess);
		expect(incrementCommandsRunMock).toHaveBeenCalledOnce();
	});

	it("logs increment failures without throwing", async () => {
		const error = new Error("database unavailable");
		const logger = { error: vi.fn() };
		incrementCommandsRunMock.mockRejectedValue(error);
		setupSapphireContainer();
		const { container } = await import("@sapphire/framework");
		(container as any).logger = logger;
		const { CommandSuccessListener } = await import("../../../src/listeners/commands/commandSuccess.js");
		const listener = new CommandSuccessListener(createListenerContext("src/listeners/commands/commandSuccess.ts"), {});

		await expect(listener.run()).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalledWith("[public-stats] Failed to increment command counter:", error);
	});
});
