import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	addConversationHistoryMessage,
	CONVERSATION_HISTORY_LIMIT,
	clearConversationHistoryForTests,
	getConversationContext,
	getConversationHistorySizeForTests,
	getReplyAnchoredConversationContext,
	isConversationHistoryEligible,
	preloadConversationHistoryForChannels,
	removeConversationHistoryMessage,
	replaceConversationHistoryMessage,
} from "../../../src/lib/autoresponder/conversationHistory.js";

function createCacheMessage(input: {
	id: string;
	content?: string;
	authorId?: string;
	bot?: boolean;
	createdTimestamp?: number;
	mentionCount?: number;
}) {
	return {
		id: input.id,
		content: input.content ?? `eligible context message ${input.id}`,
		createdTimestamp: input.createdTimestamp ?? 0,
		author: { id: input.authorId ?? input.id, bot: input.bot ?? false },
		mentions: { users: { size: input.mentionCount ?? 0 } },
	};
}

describe("conversation history cache", () => {
	beforeEach(() => {
		clearConversationHistoryForTests();
	});

	it("keeps up to 100 eligible messages per channel", () => {
		for (let index = 1; index <= CONVERSATION_HISTORY_LIMIT + 1; index++) {
			addConversationHistoryMessage(
				"channel-1",
				createCacheMessage({ id: `message-${index}`, authorId: `user-${index}` }),
			);
		}

		expect(getConversationHistorySizeForTests("channel-1")).toBe(CONVERSATION_HISTORY_LIMIT);
		expect(getConversationContext("channel-1", 2)).toBe(
			"<@user-100>: eligible context message message-100\n<@user-101>: eligible context message message-101",
		);
	});

	it("filters bot commands and low-signal messages before caching", () => {
		expect(isConversationHistoryEligible(createCacheMessage({ id: "slash", content: "/rank" }))).toBe(false);
		expect(
			isConversationHistoryEligible(createCacheMessage({ id: "bang", content: "!play never gonna give you up" })),
		).toBe(false);
		expect(isConversationHistoryEligible(createCacheMessage({ id: "bot-command", content: "<@123> !help" }))).toBe(
			false,
		);
		expect(isConversationHistoryEligible(createCacheMessage({ id: "bot", bot: true }))).toBe(false);
		expect(isConversationHistoryEligible(createCacheMessage({ id: "url", content: "https://example.com" }))).toBe(
			false,
		);
		expect(
			isConversationHistoryEligible(createCacheMessage({ id: "mass", content: "hello folks", mentionCount: 5 })),
		).toBe(false);
		expect(
			isConversationHistoryEligible(createCacheMessage({ id: "ok", content: "this should be useful context" })),
		).toBe(true);

		addConversationHistoryMessage("channel-1", createCacheMessage({ id: "slash", content: "/rank" }));
		addConversationHistoryMessage(
			"channel-1",
			createCacheMessage({ id: "ok", content: "this should be useful context" }),
		);

		expect(getConversationContext("channel-1", 10)).toBe("<@ok>: this should be useful context");
	});

	it("anchors reply context on the referenced message with up to 10 previous messages", () => {
		for (let index = 1; index <= 12; index++) {
			addConversationHistoryMessage(
				"channel-1",
				createCacheMessage({ id: `message-${index}`, authorId: `user-${index}`, content: `reply context ${index}` }),
			);
		}

		expect(getReplyAnchoredConversationContext("channel-1", "message-12", 10)).toBe(
			Array.from({ length: 11 }, (_, index) => `<@user-${index + 2}>: reply context ${index + 2}`).join("\n"),
		);
	});

	it("preloads eligible historical messages from fetched channel history oldest-first", async () => {
		const fetch = vi.fn(
			async () =>
				new Map([
					[
						"newest",
						createCacheMessage({ id: "newest", authorId: "new", content: "newest context", createdTimestamp: 3 }),
					],
					["command", createCacheMessage({ id: "command", content: "/rank", createdTimestamp: 2 })],
					[
						"oldest",
						createCacheMessage({ id: "oldest", authorId: "old", content: "oldest context", createdTimestamp: 1 }),
					],
				]),
		);
		const client = {
			channels: { fetch: vi.fn(async () => ({ messages: { fetch } })) },
		};
		const logger = { debug: vi.fn(), warn: vi.fn() };

		await preloadConversationHistoryForChannels(client as never, ["channel-1"], logger);

		expect(fetch).toHaveBeenCalledWith({ limit: 100, cache: false });
		expect(getConversationContext("channel-1", 10)).toBe("<@old>: oldest context\n<@new>: newest context");
		expect(logger.warn).not.toHaveBeenCalled();
	});
});

describe("conversation history sync", () => {
	beforeEach(() => {
		clearConversationHistoryForTests();
		for (const id of ["a", "b", "c"]) {
			addConversationHistoryMessage("channel-1", createCacheMessage({ id, content: `original ${id} text` }));
		}
	});

	it("removes a deleted message from the context", () => {
		removeConversationHistoryMessage("channel-1", "b");

		expect(getConversationContext("channel-1", 10)).toBe("<@a>: original a text\n<@c>: original c text");
		expect(getReplyAnchoredConversationContext("channel-1", "b", 5)).toBeNull();
	});

	it("ignores deletes for unknown messages and channels", () => {
		removeConversationHistoryMessage("channel-1", "missing");
		removeConversationHistoryMessage("channel-2", "a");

		expect(getConversationHistorySizeForTests("channel-1")).toBe(3);
	});

	it("replaces an edited message with its latest content in place", () => {
		replaceConversationHistoryMessage("channel-1", createCacheMessage({ id: "b", content: "edited b text" }));

		expect(getConversationContext("channel-1", 10)).toBe(
			"<@a>: original a text\n<@b>: edited b text\n<@c>: original c text",
		);
		expect(getConversationHistorySizeForTests("channel-1")).toBe(3);
	});

	it("drops an edited message that is no longer eligible", () => {
		replaceConversationHistoryMessage("channel-1", createCacheMessage({ id: "b", content: "/rank" }));

		expect(getConversationContext("channel-1", 10)).toBe("<@a>: original a text\n<@c>: original c text");
	});

	it("does not add an edited message that was not in the context", () => {
		replaceConversationHistoryMessage("channel-1", createCacheMessage({ id: "z", content: "brand new text" }));

		expect(getConversationHistorySizeForTests("channel-1")).toBe(3);
		expect(getConversationContext("channel-1", 10)).not.toContain("brand new text");
	});
});
