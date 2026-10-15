import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closePoll, getActiveExpiredPolls } from "../../../src/db/queries/polls.js";
import { endPolls, POLL_ANNOUNCE_RETRY_WINDOW_MS } from "../../../src/tasks/endPolls.js";

vi.mock("../../../src/db/queries/polls.js", () => ({
	closePoll: vi.fn(),
	getActiveExpiredPolls: vi.fn(),
}));

function poll(expiredAgoMs: number) {
	return {
		id: 5,
		messageId: "m1",
		channelId: "c1",
		guildId: "g1",
		question: "Best language?",
		options: [
			{ label: "TS", votes: ["a", "b"] },
			{ label: "Go", votes: ["c"] },
		],
		expiresAt: new Date(Date.now() - expiredAgoMs),
		closed: false,
	};
}

describe("endPolls", () => {
	const message = { edit: vi.fn(async (_options: unknown) => null) };
	const channel = {
		send: vi.fn(async (_options: unknown) => null),
		messages: { fetch: vi.fn(async () => message) },
	};
	const channelsFetch = vi.fn();
	const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

	beforeEach(() => {
		vi.clearAllMocks();
		channelsFetch.mockResolvedValue(channel);
		container.logger = logger as unknown as typeof container.logger;
		container.client = { channels: { fetch: channelsFetch } } as unknown as typeof container.client;
		vi.mocked(getActiveExpiredPolls).mockResolvedValue([poll(1000)] as never);
	});

	it("closes the poll after posting its results", async () => {
		await endPolls.run();

		const [sent] = channel.send.mock.calls[0] as unknown as [{ content: string }];
		expect(sent.content).toBe("Poll has ended!");
		expect(closePoll).toHaveBeenCalledWith("m1");
	});

	it("leaves the poll open for the next tick when the results cannot be posted", async () => {
		channel.send.mockRejectedValueOnce(new Error("Missing Permissions"));

		await endPolls.run();

		expect(closePoll).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalled();
	});

	it("leaves the poll open when the channel cannot be fetched", async () => {
		channelsFetch.mockRejectedValueOnce(new Error("Unknown Channel"));

		await endPolls.run();

		expect(closePoll).not.toHaveBeenCalled();
	});

	it("leaves the poll open when the channel cannot be posted to", async () => {
		channelsFetch.mockResolvedValueOnce({ id: "c1" });

		await endPolls.run();

		expect(closePoll).not.toHaveBeenCalled();
	});

	it("still posts the results when the original message cannot be edited", async () => {
		message.edit.mockRejectedValueOnce(new Error("Unknown Message"));

		await endPolls.run();

		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(closePoll).toHaveBeenCalledWith("m1");
	});

	it("retries a failing poll on the next run, then closes it once the results post", async () => {
		channel.send.mockRejectedValueOnce(new Error("Missing Permissions"));

		await endPolls.run();
		await endPolls.run();

		expect(channel.send).toHaveBeenCalledTimes(2);
		expect(closePoll).toHaveBeenCalledTimes(1);
	});

	it("gives up, closing the poll and logging, after the retry window", async () => {
		vi.mocked(getActiveExpiredPolls).mockResolvedValue([poll(POLL_ANNOUNCE_RETRY_WINDOW_MS + 1000)] as never);
		channel.send.mockRejectedValueOnce(new Error("Missing Permissions"));

		await endPolls.run();

		expect(closePoll).toHaveBeenCalledWith("m1");
		expect(logger.error).toHaveBeenCalled();
	});

	it("keeps ending the other polls when one fails", async () => {
		vi.mocked(getActiveExpiredPolls).mockResolvedValue([
			{ ...poll(1000), id: 5, messageId: "m1", channelId: "gone" },
			{ ...poll(1000), id: 6, messageId: "m2" },
		] as never);
		channelsFetch.mockImplementation(async (id: string) => {
			if (id === "gone") throw new Error("Unknown Channel");
			return channel;
		});

		await endPolls.run();

		expect(closePoll).toHaveBeenCalledTimes(1);
		expect(closePoll).toHaveBeenCalledWith("m2");
	});
});
