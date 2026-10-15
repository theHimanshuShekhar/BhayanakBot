import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markArchivedChannelMessagesDeleted } from "../../../src/db/queries/archivedChannelMessages.js";
import {
	addConversationHistoryMessage,
	clearConversationHistoryForTests,
	getConversationContext,
} from "../../../src/lib/autoresponder/conversationHistory.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { MessageDeleteBulkListener } from "../../../src/listeners/messages/messageDeleteBulk.js";
import { createListenerContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/archivedChannelMessages.js", () => ({
	markArchivedChannelMessagesDeleted: vi.fn().mockResolvedValue(undefined),
}));

function chatMessage(id: string, channelId: string) {
	return {
		id,
		channelId,
		content: `message ${id} text`,
		createdTimestamp: 0,
		author: { id: `user-${id}`, bot: false },
		mentions: { users: { size: 0 } },
	};
}

function createListener() {
	return new MessageDeleteBulkListener(createListenerContext("src/listeners/messages/messageDeleteBulk.ts"), {});
}

describe("messageDeleteBulk", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
		(container as any).logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
		clearConversationHistoryForTests();
	});

	it("marks every bulk-deleted Guess Who Channel message deleted in the archive", async () => {
		const messages = new Map([
			["a", chatMessage("a", GUESS_WHO_CHANNEL_ID)],
			["b", chatMessage("b", GUESS_WHO_CHANNEL_ID)],
		]);

		await createListener().run(messages as never, { id: GUESS_WHO_CHANNEL_ID } as never);

		expect(markArchivedChannelMessagesDeleted).toHaveBeenCalledExactlyOnceWith(["a", "b"]);
	});

	it("leaves the archive alone for other channels", async () => {
		const messages = new Map([["a", chatMessage("a", "other-channel")]]);

		await createListener().run(messages as never, { id: "other-channel" } as never);

		expect(markArchivedChannelMessagesDeleted).not.toHaveBeenCalled();
	});

	it("removes bulk-deleted messages from the AI conversation context", async () => {
		for (const id of ["a", "b", "c"]) addConversationHistoryMessage("other-channel", chatMessage(id, "other-channel"));
		const messages = new Map([
			["a", { id: "a" }],
			["c", { id: "c" }],
		]);

		await createListener().run(messages as never, { id: "other-channel" } as never);

		expect(getConversationContext("other-channel", 10)).toBe("<@user-b>: message b text");
	});

	it("still clears the AI context when the archive update fails", async () => {
		vi.mocked(markArchivedChannelMessagesDeleted).mockRejectedValueOnce(new Error("db down"));
		addConversationHistoryMessage(GUESS_WHO_CHANNEL_ID, chatMessage("a", GUESS_WHO_CHANNEL_ID));

		await createListener().run(new Map([["a", { id: "a" }]]) as never, { id: GUESS_WHO_CHANNEL_ID } as never);

		expect(getConversationContext(GUESS_WHO_CHANNEL_ID, 10)).toBe("");
		expect(container.logger.error).toHaveBeenCalled();
	});
});
