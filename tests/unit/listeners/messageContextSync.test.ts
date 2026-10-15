import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	addConversationHistoryMessage,
	clearConversationHistoryForTests,
	getConversationContext,
} from "../../../src/lib/autoresponder/conversationHistory.js";
import { createListenerContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/database.js", () => ({ db: {} }));
vi.mock("../../../src/db/queries/guildSettings.js", () => ({
	getOrCreateSettings: vi.fn().mockResolvedValue({ logChannelId: null }),
}));
vi.mock("../../../src/db/queries/archivedChannelMessages.js", () => ({
	markArchivedChannelMessageDeleted: vi.fn().mockResolvedValue(undefined),
	markArchivedChannelMessageEdited: vi.fn().mockResolvedValue(undefined),
}));

const CHANNEL_ID = "channel-1";

function createMessage(id: string, content: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		channelId: CHANNEL_ID,
		partial: false,
		content,
		createdTimestamp: 0,
		author: { id: `user-${id}`, bot: false, tag: `user-${id}#0001`, displayAvatarURL: () => null },
		mentions: { users: { size: 0 } },
		guild: { id: "guild-1", channels: { cache: new Map() } },
		...overrides,
	};
}

async function createListener<T>(file: string, exportName: string): Promise<T> {
	const mod = (await import(file)) as Record<string, new (...args: any[]) => T>;
	const ListenerClass = mod[exportName] as new (...args: any[]) => T;
	return new ListenerClass(createListenerContext(`src/listeners/messages/${file.split("/").pop()}`), {});
}

function setupClient() {
	(container as any).client = { snipeCache: new Map(), editSnipeCache: new Map() };
	(container as any).logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

describe("AI conversation context stays in sync with Discord", () => {
	beforeEach(() => {
		setupSapphireContainer();
		setupClient();
		clearConversationHistoryForTests();
		for (const id of ["a", "b", "c"]) {
			addConversationHistoryMessage(CHANNEL_ID, createMessage(id, `original ${id} text`));
		}
	});

	it("messageDelete removes the deleted message from the context", async () => {
		const listener = await createListener<{ run(m: unknown): Promise<void> }>(
			"../../../src/listeners/messages/messageDelete.js",
			"MessageDeleteListener",
		);

		await listener.run(createMessage("b", "original b text"));

		expect(getConversationContext(CHANNEL_ID, 10)).toBe("<@user-a>: original a text\n<@user-c>: original c text");
	});

	it("messageDelete removes an uncached (partial) deleted message too", async () => {
		const listener = await createListener<{ run(m: unknown): Promise<void> }>(
			"../../../src/listeners/messages/messageDelete.js",
			"MessageDeleteListener",
		);

		await listener.run({ id: "b", channelId: CHANNEL_ID, partial: true });

		expect(getConversationContext(CHANNEL_ID, 10)).not.toContain("original b text");
	});

	it("messageUpdate replaces the message with its latest content in place", async () => {
		const listener = await createListener<{ run(o: unknown, n: unknown): Promise<void> }>(
			"../../../src/listeners/messages/messageUpdate.js",
			"MessageUpdateListener",
		);

		await listener.run(createMessage("b", "original b text"), createMessage("b", "edited b text"));

		expect(getConversationContext(CHANNEL_ID, 10)).toBe(
			"<@user-a>: original a text\n<@user-b>: edited b text\n<@user-c>: original c text",
		);
	});

	it("messageUpdate drops the message when its edited content cannot be known", async () => {
		const listener = await createListener<{ run(o: unknown, n: unknown): Promise<void> }>(
			"../../../src/listeners/messages/messageUpdate.js",
			"MessageUpdateListener",
		);

		await listener.run(
			createMessage("b", "original b text"),
			createMessage("b", "", { partial: true, content: null, author: null }),
		);

		expect(getConversationContext(CHANNEL_ID, 10)).not.toContain("original b text");
		expect(getConversationContext(CHANNEL_ID, 10)).toContain("original a text");
	});
});
