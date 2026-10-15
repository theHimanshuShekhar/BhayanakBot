import { Collection, type TextBasedChannel } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	EMBED_DESCRIPTION_LIMIT,
	fetchRecentMessages,
	formatCoverage,
	type SummaryMessage,
	trimToBudget,
	truncateForEmbed,
} from "../../../src/lib/summarize.js";

const BASE = 1_700_000_000_000;

interface FakeMessage {
	id: string;
	createdTimestamp: number;
	content: string;
	author: { bot: boolean; displayName: string };
}

// Message i is the i-th oldest: created i seconds after BASE, content "m<i>".
function fakeMessage(i: number, overrides: Partial<FakeMessage> = {}): FakeMessage {
	return {
		id: String(1000 + i),
		createdTimestamp: BASE + i * 1000,
		content: `m${i}`,
		author: { bot: false, displayName: "ann" },
		...overrides,
	};
}

// Behaves like Discord: pages come back newest-first and `before` selects strictly older messages.
function fakeChannel(history: FakeMessage[]) {
	const newestFirst = [...history].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
	const fetch = vi.fn(async ({ limit, before }: { limit: number; before?: string }) => {
		const start = before ? newestFirst.findIndex((m) => m.id === before) + 1 : 0;
		return new Collection(newestFirst.slice(start, start + limit).map((m) => [m.id, m]));
	});
	return { channel: { messages: { fetch } } as unknown as TextBasedChannel, fetch };
}

const lines = (messages: SummaryMessage[]) => messages.map((m) => m.line);

describe("fetchRecentMessages", () => {
	it("returns more than 100 messages in chronological order", async () => {
		const { channel } = fakeChannel(Array.from({ length: 150 }, (_, i) => fakeMessage(i)));

		const messages = await fetchRecentMessages(channel, { limit: 200 });

		expect(messages).toHaveLength(150);
		expect(lines(messages)).toEqual(Array.from({ length: 150 }, (_, i) => `ann: m${i}`));
	});

	it("keeps the newest messages when over the limit", async () => {
		const { channel } = fakeChannel(Array.from({ length: 450 }, (_, i) => fakeMessage(i)));

		const messages = await fetchRecentMessages(channel, { limit: 200 });

		expect(messages).toHaveLength(200);
		expect(messages[0].line).toBe("ann: m250");
		expect(messages[199].line).toBe("ann: m449");
	});

	it("applies the limit across pages, not per page", async () => {
		const { channel, fetch } = fakeChannel(Array.from({ length: 450 }, (_, i) => fakeMessage(i)));

		await fetchRecentMessages(channel, { limit: 120 });

		// 120 messages need two pages of 100; a third page would mean the cap was ignored.
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("stops at the window start and includes a message exactly on it", async () => {
		const { channel, fetch } = fakeChannel(Array.from({ length: 300 }, (_, i) => fakeMessage(i)));
		const since = BASE + 120 * 1000;

		const messages = await fetchRecentMessages(channel, { limit: 200, since });

		expect(messages).toHaveLength(180);
		expect(messages[0].line).toBe("ann: m120");
		expect(messages[0].createdTimestamp).toBe(since);
		expect(messages[179].line).toBe("ann: m299");
		// Pages cover m299..m200, m199..m100; the second contains the boundary so no third fetch.
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("keeps the newest messages inside the window when the window holds more than the limit", async () => {
		const { channel } = fakeChannel(Array.from({ length: 300 }, (_, i) => fakeMessage(i)));

		const messages = await fetchRecentMessages(channel, { limit: 200, since: BASE });

		expect(messages).toHaveLength(200);
		expect(messages[0].line).toBe("ann: m100");
		expect(messages[199].line).toBe("ann: m299");
	});

	it("returns nothing when every message is older than the window", async () => {
		const { channel } = fakeChannel(Array.from({ length: 10 }, (_, i) => fakeMessage(i)));

		expect(await fetchRecentMessages(channel, { limit: 200, since: BASE + 1_000_000 })).toEqual([]);
	});

	it("skips bot and empty messages without counting them toward the limit", async () => {
		const history = Array.from({ length: 60 }, (_, i) =>
			i % 3 === 0
				? fakeMessage(i, { author: { bot: true, displayName: "bot" } })
				: i % 3 === 1
					? fakeMessage(i, { content: "   " })
					: fakeMessage(i),
		);
		const { channel } = fakeChannel(history);

		const messages = await fetchRecentMessages(channel, { limit: 5 });

		expect(lines(messages)).toEqual(["ann: m47", "ann: m50", "ann: m53", "ann: m56", "ann: m59"]);
	});

	it("returns what it has when a fetch fails", async () => {
		const channel = { messages: { fetch: vi.fn().mockRejectedValue(new Error("missing access")) } };

		expect(await fetchRecentMessages(channel as unknown as TextBasedChannel, { limit: 50 })).toEqual([]);
	});
});

describe("trimToBudget", () => {
	const msg = (line: string, i: number): SummaryMessage => ({ line, createdTimestamp: BASE + i });

	it("keeps everything that fits", () => {
		const input = [msg("a: one", 0), msg("b: two", 1)];

		const { messages, prompt } = trimToBudget(input, 100);

		expect(messages).toEqual(input);
		expect(prompt).toBe("a: one\nb: two");
	});

	it("drops from the oldest end and never exceeds the budget", () => {
		const input = Array.from({ length: 50 }, (_, i) => msg(`u: ${"x".repeat(98)}`, i)); // 100 chars each

		const { messages, prompt } = trimToBudget(input, 1000);

		expect(prompt.length).toBeLessThanOrEqual(1000);
		expect(messages).toHaveLength(9); // 9 lines + 8 newlines = 908; a tenth would be 1009
		expect(messages[0]).toBe(input[41]);
		expect(messages[8]).toBe(input[49]);
	});

	it("truncates a single oversized newest message rather than sending nothing", () => {
		const { messages, prompt } = trimToBudget([msg("old", 0), msg("z".repeat(500), 1)], 100);

		expect(messages).toHaveLength(1);
		expect(prompt).toHaveLength(100);
	});

	it("uses the 24k default budget", () => {
		const input = Array.from({ length: 200 }, (_, i) => msg("y".repeat(500), i));

		expect(trimToBudget(input).prompt.length).toBeLessThanOrEqual(24_000);
	});
});

describe("formatCoverage", () => {
	it("states the count and the starting time as a Discord timestamp", () => {
		expect(formatCoverage(143, 1_700_000_123_456)).toBe("Summarized the last 143 messages (since <t:1700000123:t>)");
	});

	it("uses the singular for one message", () => {
		expect(formatCoverage(1, 1_700_000_000_000)).toBe("Summarized the last 1 message (since <t:1700000000:t>)");
	});
});

describe("truncateForEmbed", () => {
	it("leaves text within the limit alone", () => {
		const text = "a".repeat(EMBED_DESCRIPTION_LIMIT);
		expect(truncateForEmbed(text)).toBe(text);
	});

	it("cuts long text to the embed description limit with an ellipsis", () => {
		const out = truncateForEmbed("a".repeat(10_000));
		expect(out).toHaveLength(EMBED_DESCRIPTION_LIMIT);
		expect(out.endsWith("…")).toBe(true);
	});

	it("does not split a surrogate pair at the cut", () => {
		const out = truncateForEmbed(`${"a".repeat(EMBED_DESCRIPTION_LIMIT - 2)}😀😀`);
		expect(out.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
		expect(out).not.toMatch(/[\ud800-\udbff]…$/);
	});
});
