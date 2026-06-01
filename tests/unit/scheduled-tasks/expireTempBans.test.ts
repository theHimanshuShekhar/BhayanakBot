import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCase, deactivateCase, getExpiredActiveCases } from "../../../src/db/queries/modCases.js";
import { ExpireTempBansTask } from "../../../src/scheduled-tasks/expireTempBans.js";

vi.mock("../../../src/db/queries/modCases.js", () => ({
	createCase: vi.fn(),
	deactivateCase: vi.fn(),
	getExpiredActiveCases: vi.fn(),
}));

const mockedCreateCase = vi.mocked(createCase);
const mockedDeactivateCase = vi.mocked(deactivateCase);
const mockedGetExpiredActiveCases = vi.mocked(getExpiredActiveCases);

function createTask(): ExpireTempBansTask {
	return new ExpireTempBansTask(
		{ store: {} as any, path: "expireTempBans.ts", root: ".", name: "expireTempBans" } as any,
		{},
	);
}

describe("ExpireTempBansTask", () => {
	beforeEach(() => {
		mockedCreateCase.mockReset();
		mockedDeactivateCase.mockReset();
		mockedGetExpiredActiveCases.mockReset();
		(container as any).logger = { error: vi.fn(), warn: vi.fn() };
		(container as any).client = {
			user: { id: "bot-user" },
			guilds: { fetch: vi.fn() },
		};
	});

	it("leaves tempban cases active when Discord unban fails", async () => {
		mockedGetExpiredActiveCases.mockResolvedValueOnce([
			{
				id: 1,
				caseNumber: 1,
				guildId: "guild-1",
				userId: "user-1",
				moderatorId: "mod-1",
				type: "tempban",
				reason: null,
				duration: null,
				expiresAt: new Date(),
				active: true,
				createdAt: new Date(),
			},
		]);
		(container.client.guilds.fetch as any).mockResolvedValueOnce({
			members: { unban: vi.fn().mockRejectedValueOnce(new Error("missing permissions")) },
		});

		await createTask().run();

		expect(mockedDeactivateCase).not.toHaveBeenCalled();
		expect(mockedCreateCase).not.toHaveBeenCalled();
		expect(container.logger.warn).toHaveBeenCalledWith(expect.stringContaining("will retry"));
	});

	it("deactivates the tempban and creates an unban case after successful unban", async () => {
		mockedGetExpiredActiveCases.mockResolvedValueOnce([
			{
				id: 2,
				caseNumber: 1,
				guildId: "guild-1",
				userId: "user-2",
				moderatorId: "mod-1",
				type: "tempban",
				reason: null,
				duration: null,
				expiresAt: new Date(),
				active: true,
				createdAt: new Date(),
			},
		]);
		(container.client.guilds.fetch as any).mockResolvedValueOnce({
			members: { unban: vi.fn().mockResolvedValueOnce(undefined) },
		});

		await createTask().run();

		expect(mockedDeactivateCase).toHaveBeenCalledWith(2);
		expect(mockedCreateCase).toHaveBeenCalledWith(
			expect.objectContaining({ guildId: "guild-1", userId: "user-2", moderatorId: "bot-user", type: "unban" }),
		);
	});
});
