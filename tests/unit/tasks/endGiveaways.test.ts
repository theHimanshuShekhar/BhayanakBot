import { container } from "@sapphire/framework";
import { DiscordAPIError } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endGiveaway, getActiveExpiredGiveaways } from "../../../src/db/queries/giveaways.js";
import { endGiveaways } from "../../../src/tasks/endGiveaways.js";
import { createGiveawayRow, createGuild } from "../../helpers/giveawayMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	endGiveaway: vi.fn(),
	getActiveExpiredGiveaways: vi.fn(),
}));

describe("endGiveaways", () => {
	const guild = createGuild(["w1"]);
	const guildsFetch = vi.fn();
	const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

	beforeEach(() => {
		vi.clearAllMocks();
		guild.channel.send.mockClear();
		guildsFetch.mockResolvedValue(guild);
		container.logger = logger as unknown as typeof container.logger;
		container.client = { guilds: { fetch: guildsFetch } } as unknown as typeof container.client;
		vi.mocked(getActiveExpiredGiveaways).mockResolvedValue([createGiveawayRow({ entries: ["w1"] })] as never);
	});

	it("announces nothing when a moderator already ended the giveaway", async () => {
		vi.mocked(endGiveaway).mockResolvedValue(undefined);

		await endGiveaways.run();

		expect(guildsFetch).toHaveBeenCalledWith("g1");
		expect(endGiveaway).toHaveBeenCalledWith("g1", "m1", ["w1"]);
		expect(guild.channel.send).not.toHaveBeenCalled();
	});

	it("closes a giveaway silently when the bot has left its guild", async () => {
		guildsFetch.mockRejectedValue(Object.assign(Object.create(DiscordAPIError.prototype), { code: 10004 }));

		await endGiveaways.run();

		expect(endGiveaway).toHaveBeenCalledWith("g1", "m1", []);
		expect(guild.channel.send).not.toHaveBeenCalled();
	});

	it("leaves the giveaway open for a retry when the guild lookup fails transiently", async () => {
		guildsFetch.mockRejectedValue(new Error("network"));

		await endGiveaways.run();

		expect(endGiveaway).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalled();
	});
});
