import { DiscordAPIError } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getRandomGuessWhoMessage,
	markArchivedChannelMessageDeleted,
} from "../../../src/db/queries/archivedChannelMessages.js";
import { pickLiveGuessWhoMessage } from "../../../src/lib/guessWho/pick.js";

vi.mock("../../../src/db/queries/archivedChannelMessages.js", () => ({
	getRandomGuessWhoMessage: vi.fn(),
	markArchivedChannelMessageDeleted: vi.fn().mockResolvedValue(undefined),
}));

const query = { guildId: "g1", channelId: "c1", excludeAuthorUserId: "player" };
const row = (messageId: string) => ({ messageId }) as never;

function unknownMessage() {
	return new DiscordAPIError({ code: 10008, message: "Unknown Message" }, 10008, 404, "GET", "/messages/x", {});
}

describe("pickLiveGuessWhoMessage", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(markArchivedChannelMessageDeleted).mockResolvedValue(undefined);
	});

	it("returns the picked message when it still exists on Discord", async () => {
		vi.mocked(getRandomGuessWhoMessage).mockResolvedValueOnce(row("m1"));
		const fetch = vi.fn().mockResolvedValue({});

		const picked = await pickLiveGuessWhoMessage(query, { messages: { fetch } });

		expect(picked?.messageId).toBe("m1");
		expect(fetch).toHaveBeenCalledWith("m1");
		expect(markArchivedChannelMessageDeleted).not.toHaveBeenCalled();
	});

	it("marks a message gone from Discord as deleted and picks another", async () => {
		vi.mocked(getRandomGuessWhoMessage).mockResolvedValueOnce(row("gone")).mockResolvedValueOnce(row("alive"));
		const fetch = vi.fn().mockRejectedValueOnce(unknownMessage()).mockResolvedValueOnce({});

		const picked = await pickLiveGuessWhoMessage(query, { messages: { fetch } });

		expect(picked?.messageId).toBe("alive");
		expect(markArchivedChannelMessageDeleted).toHaveBeenCalledExactlyOnceWith("gone");
		expect(vi.mocked(getRandomGuessWhoMessage).mock.calls[1]?.[0].excludeMessageIds).toEqual(["gone"]);
	});

	it("does not mark a message deleted when the fetch fails for another reason", async () => {
		vi.mocked(getRandomGuessWhoMessage).mockResolvedValueOnce(row("flaky")).mockResolvedValueOnce(row("alive"));
		const fetch = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce({});
		const logger = { warn: vi.fn() };

		const picked = await pickLiveGuessWhoMessage(query, { messages: { fetch } }, logger);

		expect(picked?.messageId).toBe("alive");
		expect(markArchivedChannelMessageDeleted).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(vi.mocked(getRandomGuessWhoMessage).mock.calls[1]?.[0].excludeMessageIds).toEqual(["flaky"]);
	});

	it("gives up after a bounded number of attempts", async () => {
		let next = 0;
		vi.mocked(getRandomGuessWhoMessage).mockImplementation(async () => row(`m${next++}`));
		const fetch = vi.fn().mockRejectedValue(unknownMessage());

		expect(await pickLiveGuessWhoMessage(query, { messages: { fetch } })).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(5);
	});

	it("returns null when the archive has nothing left to pick", async () => {
		vi.mocked(getRandomGuessWhoMessage).mockResolvedValue(null);
		const fetch = vi.fn();

		expect(await pickLiveGuessWhoMessage(query, { messages: { fetch } })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});
