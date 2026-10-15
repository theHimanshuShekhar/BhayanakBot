import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { backfillGuessWhoMessages, resolveBackfillLimit } from "../../../src/lib/guessWho/backfill.js";

vi.mock("../../../src/db/queries/archivedChannelMessages.js", () => ({
	upsertArchivedChannelMessage: vi.fn().mockResolvedValue({ inserted: true, deleted: false }),
}));
// What `Number.parseInt("", 10)` yields when Docker Compose passes a blank GUESS_WHO_BACKFILL_LIMIT.
vi.mock("../../../src/lib/constants.js", () => ({
	GUESS_WHO_CHANNEL_ID: "channel-1",
	GUESS_WHO_BACKFILL_LIMIT: Number.NaN,
}));

describe("resolveBackfillLimit", () => {
	it("keeps a valid limit, including 0 to disable backfill", () => {
		expect(resolveBackfillLimit(250)).toBe(250);
		expect(resolveBackfillLimit(0)).toBe(0);
	});

	it("falls back to the default for NaN or negative values", () => {
		expect(resolveBackfillLimit(Number.NaN)).toBe(1000);
		expect(resolveBackfillLimit(-5)).toBe(1000);
	});
});

describe("backfillGuessWhoMessages", () => {
	it("still scans the channel when the configured limit is invalid", async () => {
		const fetch = vi.fn().mockResolvedValue(new Map());
		const client = {
			channels: { fetch: vi.fn().mockResolvedValue({ type: ChannelType.GuildText, messages: { fetch } }) },
		};

		await backfillGuessWhoMessages(client as never);

		expect(fetch).toHaveBeenCalledWith({ limit: 100, before: undefined });
	});
});
