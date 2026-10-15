import { container } from "@sapphire/framework";
import { DiscordAPIError } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	endGiveaway,
	getActiveExpiredGiveaways,
	getGiveawaysAwaitingAnnouncement,
	markGiveawayAnnounced,
	recordGiveawayAnnounceFailure,
} from "../../../src/db/queries/giveaways.js";
import { GIVEAWAY_ANNOUNCE_MAX_ATTEMPTS } from "../../../src/lib/giveaways.js";
import { endGiveaways } from "../../../src/tasks/endGiveaways.js";
import { createGiveawayRow, createGuild } from "../../helpers/giveawayMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	endGiveaway: vi.fn(),
	getActiveExpiredGiveaways: vi.fn(),
	getGiveawaysAwaitingAnnouncement: vi.fn(),
	markGiveawayAnnounced: vi.fn(),
	recordGiveawayAnnounceFailure: vi.fn(),
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
		vi.mocked(getGiveawaysAwaitingAnnouncement).mockResolvedValue([]);
		vi.mocked(recordGiveawayAnnounceFailure).mockResolvedValue(undefined);
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

	it("marks a giveaway announced only after its result was posted", async () => {
		vi.mocked(endGiveaway).mockResolvedValue(createGiveawayRow({ id: 7, ended: true, winners: ["w1"] }) as never);

		await endGiveaways.run();

		expect(guild.channel.send).toHaveBeenCalledTimes(1);
		expect(markGiveawayAnnounced).toHaveBeenCalledWith(7);
		expect(recordGiveawayAnnounceFailure).not.toHaveBeenCalled();
	});

	it("keeps an ended giveaway unannounced, to retry, when the announcement cannot be posted", async () => {
		vi.mocked(endGiveaway).mockResolvedValue(createGiveawayRow({ id: 7, ended: true, winners: ["w1"] }) as never);
		guild.channel.send.mockRejectedValueOnce(new Error("Missing Access"));

		await endGiveaways.run();

		expect(markGiveawayAnnounced).not.toHaveBeenCalled();
		expect(recordGiveawayAnnounceFailure).toHaveBeenCalledWith(7);
	});

	it("keeps an ended giveaway unannounced when its channel is gone", async () => {
		vi.mocked(endGiveaway).mockResolvedValue(createGiveawayRow({ id: 7, ended: true, winners: ["w1"] }) as never);
		guild.channels.fetch.mockRejectedValueOnce(new Error("Unknown Channel"));

		await endGiveaways.run();

		expect(markGiveawayAnnounced).not.toHaveBeenCalled();
		expect(recordGiveawayAnnounceFailure).toHaveBeenCalledWith(7);
	});

	describe("retrying an announcement", () => {
		beforeEach(() => {
			vi.mocked(getActiveExpiredGiveaways).mockResolvedValue([]);
		});

		it("posts the stored winners without ending or drawing again, then marks the giveaway announced", async () => {
			vi.mocked(getGiveawaysAwaitingAnnouncement).mockResolvedValue([
				createGiveawayRow({ id: 7, ended: true, winners: ["w1"], entries: ["w1", "w2"], announceAttempts: 2 }),
			] as never);

			await endGiveaways.run();

			expect(endGiveaway).not.toHaveBeenCalled();
			const [sent] = guild.channel.send.mock.calls[0] as unknown as [{ content: string }];
			expect(sent.content).toContain("<@w1>");
			expect(markGiveawayAnnounced).toHaveBeenCalledWith(7);
		});

		it("records another failure when the retry fails too", async () => {
			vi.mocked(getGiveawaysAwaitingAnnouncement).mockResolvedValue([
				createGiveawayRow({ id: 7, ended: true, winners: ["w1"], announceAttempts: 2 }),
			] as never);
			guild.channel.send.mockRejectedValueOnce(new Error("Missing Access"));

			await endGiveaways.run();

			expect(markGiveawayAnnounced).not.toHaveBeenCalled();
			expect(recordGiveawayAnnounceFailure).toHaveBeenCalledWith(7);
		});

		it("gives up and logs after the maximum number of attempts", async () => {
			vi.mocked(getGiveawaysAwaitingAnnouncement).mockResolvedValue([
				createGiveawayRow({ id: 7, ended: true, announceAttempts: GIVEAWAY_ANNOUNCE_MAX_ATTEMPTS }),
			] as never);

			await endGiveaways.run();

			expect(guild.channel.send).not.toHaveBeenCalled();
			expect(markGiveawayAnnounced).toHaveBeenCalledWith(7);
			expect(logger.error).toHaveBeenCalled();
		});

		it("stops retrying when the bot has left the guild", async () => {
			vi.mocked(getGiveawaysAwaitingAnnouncement).mockResolvedValue([
				createGiveawayRow({ id: 7, ended: true }),
			] as never);
			guildsFetch.mockRejectedValue(Object.assign(Object.create(DiscordAPIError.prototype), { code: 10004 }));

			await endGiveaways.run();

			expect(markGiveawayAnnounced).toHaveBeenCalledWith(7);
		});
	});

	it("leaves the giveaway open for a retry when the guild lookup fails transiently", async () => {
		guildsFetch.mockRejectedValue(new Error("network"));

		await endGiveaways.run();

		expect(endGiveaway).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalled();
	});
});
