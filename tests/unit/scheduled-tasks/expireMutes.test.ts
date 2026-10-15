import { container } from "@sapphire/framework";
import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCase, deactivateCase, getExpiredActiveCases } from "../../../src/db/queries/modCases.js";
import { db } from "../../../src/lib/database.js";
import { ExpireMutesTask } from "../../../src/scheduled-tasks/expireMutes.js";

vi.mock("../../../src/db/queries/modCases.js", () => ({
	createCase: vi.fn(),
	deactivateCase: vi.fn(),
	getExpiredActiveCases: vi.fn(),
}));

vi.mock("../../../src/lib/database.js", () => ({
	db: { query: { guildSettings: { findFirst: vi.fn() } } },
}));

const mockedCreateCase = vi.mocked(createCase);
const mockedDeactivateCase = vi.mocked(deactivateCase);
const mockedGetExpiredActiveCases = vi.mocked(getExpiredActiveCases);
const mockedFindSettings = vi.mocked(db.query.guildSettings.findFirst) as any;

function discordError(code: RESTJSONErrorCodes, status = 404): DiscordAPIError {
	return new DiscordAPIError({ code, message: "error" }, code, status, "GET", "/test", {});
}

function expiredMute(id = 1) {
	return {
		id,
		caseNumber: 1,
		guildId: "guild-1",
		userId: "user-1",
		moderatorId: "mod-1",
		type: "mute" as const,
		reason: null,
		duration: null,
		expiresAt: new Date(),
		active: true,
		createdAt: new Date(),
	};
}

function createGuild(options: { fetchMember?: ReturnType<typeof vi.fn> } = {}) {
	const remove = vi.fn().mockResolvedValue(undefined);
	const fetchMember = options.fetchMember ?? vi.fn().mockResolvedValue({ roles: { remove } });
	return { guild: { members: { fetch: fetchMember } }, remove, fetchMember };
}

function createTask(): ExpireMutesTask {
	return new ExpireMutesTask({ store: {} as any, path: "expireMutes.ts", root: ".", name: "expireMutes" } as any, {});
}

describe("ExpireMutesTask", () => {
	beforeEach(() => {
		mockedCreateCase.mockReset();
		mockedDeactivateCase.mockReset();
		mockedGetExpiredActiveCases.mockReset();
		mockedFindSettings.mockReset();
		mockedFindSettings.mockResolvedValue({ mutedRoleId: "muted-role" });
		(container as any).logger = { error: vi.fn(), warn: vi.fn() };
		(container as any).client = {
			user: { id: "bot-user" },
			guilds: { fetch: vi.fn() },
		};
	});

	it("removes the muted role, closes the case, and records an unmute case", async () => {
		const { guild, remove } = createGuild();
		mockedGetExpiredActiveCases.mockResolvedValueOnce([expiredMute(3)]);
		(container.client.guilds.fetch as any).mockResolvedValueOnce(guild);

		await createTask().run();

		expect(remove).toHaveBeenCalledWith("muted-role", "Mute expired");
		expect(mockedDeactivateCase).toHaveBeenCalledWith(3);
		expect(mockedCreateCase).toHaveBeenCalledWith(expect.objectContaining({ type: "unmute", userId: "user-1" }));
	});

	it("leaves the case active when fetching the guild fails transiently", async () => {
		mockedGetExpiredActiveCases.mockResolvedValueOnce([expiredMute()]);
		(container.client.guilds.fetch as any).mockRejectedValueOnce(
			discordError(RESTJSONErrorCodes.MissingPermissions, 503),
		);

		await createTask().run();

		expect(mockedDeactivateCase).not.toHaveBeenCalled();
		expect(mockedCreateCase).not.toHaveBeenCalled();
	});

	it("closes the case without an unmute case when the bot was removed from the guild", async () => {
		mockedGetExpiredActiveCases.mockResolvedValueOnce([expiredMute(5)]);
		(container.client.guilds.fetch as any).mockRejectedValueOnce(discordError(RESTJSONErrorCodes.UnknownGuild));

		await createTask().run();

		expect(mockedDeactivateCase).toHaveBeenCalledWith(5);
		expect(mockedCreateCase).not.toHaveBeenCalled();
	});

	it.each([
		["a rate limit", discordError(RESTJSONErrorCodes.MissingPermissions, 429)],
		["a server error", discordError(RESTJSONErrorCodes.MissingPermissions, 502)],
		["a network error", new Error("read ECONNRESET")],
	])("leaves the case active when fetching the member fails with %s", async (_label, error) => {
		const { guild } = createGuild({ fetchMember: vi.fn().mockRejectedValue(error) });
		mockedGetExpiredActiveCases.mockResolvedValueOnce([expiredMute()]);
		(container.client.guilds.fetch as any).mockResolvedValueOnce(guild);

		await createTask().run();

		expect(mockedDeactivateCase).not.toHaveBeenCalled();
		expect(mockedCreateCase).not.toHaveBeenCalled();
	});

	it("leaves the case active when removing the muted role fails", async () => {
		const remove = vi.fn().mockRejectedValue(discordError(RESTJSONErrorCodes.MissingPermissions, 503));
		const { guild } = createGuild({ fetchMember: vi.fn().mockResolvedValue({ roles: { remove } }) });
		mockedGetExpiredActiveCases.mockResolvedValueOnce([expiredMute()]);
		(container.client.guilds.fetch as any).mockResolvedValueOnce(guild);

		await createTask().run();

		expect(mockedDeactivateCase).not.toHaveBeenCalled();
		expect(container.logger.warn).toHaveBeenCalledWith(expect.stringContaining("will retry"));
	});

	it("closes the case when the member has left the guild", async () => {
		const { guild } = createGuild({
			fetchMember: vi.fn().mockRejectedValue(discordError(RESTJSONErrorCodes.UnknownMember)),
		});
		mockedGetExpiredActiveCases.mockResolvedValueOnce([expiredMute(9)]);
		(container.client.guilds.fetch as any).mockResolvedValueOnce(guild);

		await createTask().run();

		expect(mockedDeactivateCase).toHaveBeenCalledWith(9);
		expect(mockedCreateCase).toHaveBeenCalledWith(expect.objectContaining({ type: "unmute" }));
	});
});
