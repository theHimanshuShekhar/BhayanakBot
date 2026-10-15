import { beforeEach, describe, expect, it, vi } from "vitest";
import { createListenerContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const dbMock = vi.hoisted(() => {
	const insertValues = vi.fn().mockResolvedValue(undefined);
	const updateWhere = vi.fn().mockResolvedValue(undefined);
	const updateSet = vi.fn(() => ({ where: updateWhere }));
	return {
		insertValues,
		updateSet,
		updateWhere,
		db: {
			query: {
				guildSettings: { findFirst: vi.fn() },
				starredMessages: { findFirst: vi.fn() },
			},
			insert: vi.fn(() => ({ values: insertValues })),
			update: vi.fn(() => ({ set: updateSet })),
		},
	};
});

vi.mock("../../../src/lib/database.js", () => ({ db: dbMock.db }));

function createReaction(options: { emoji?: string; count?: number; sendResult?: unknown } = {}) {
	const send = vi.fn().mockResolvedValue(options.sendResult ?? { id: "starboard-message-1" });
	const edit = vi.fn().mockResolvedValue(undefined);
	const starboardChannel = { send, messages: { fetch: vi.fn().mockResolvedValue({ edit }) } };
	const reaction = {
		partial: false,
		count: options.count ?? 3,
		emoji: { id: null, name: options.emoji ?? "⭐" },
		message: {
			id: "message-1",
			channelId: "channel-1",
			partial: false,
			content: "hello world",
			author: { tag: "author#0001", displayAvatarURL: () => "https://cdn.example/avatar.png" },
			attachments: { first: () => undefined },
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			guild: { id: "guild-1", channels: { cache: new Map([["starboard-1", starboardChannel]]) } },
		},
	};
	return { reaction, send, edit };
}

async function runListener(reaction: unknown, user: { bot: boolean } = { bot: false }) {
	const { MessageReactionAddListener } = await import("../../../src/listeners/reactions/messageReactionAdd.js");
	const listener = new MessageReactionAddListener(
		createListenerContext("src/listeners/reactions/messageReactionAdd.ts"),
		{},
	);
	await listener.run(reaction as never, { id: "user-1", ...user } as never);
}

describe("MessageReactionAddListener starboard", () => {
	beforeEach(() => {
		setupSapphireContainer();
		vi.clearAllMocks();
		dbMock.db.query.guildSettings.findFirst.mockResolvedValue({
			guildId: "guild-1",
			starboardChannelId: "starboard-1",
			starThreshold: 3,
		});
		dbMock.db.query.starredMessages.findFirst.mockResolvedValue(undefined);
	});

	it("posts a new starboard message once the star threshold is reached", async () => {
		const { reaction, send } = createReaction({ count: 3 });

		await runListener(reaction);

		expect(send).toHaveBeenCalledOnce();
		expect(dbMock.insertValues).toHaveBeenCalledWith({
			messageId: "message-1",
			starboardMessageId: "starboard-message-1",
			guildId: "guild-1",
			starCount: 3,
		});
	});

	it("updates the existing starboard message when more stars arrive", async () => {
		dbMock.db.query.starredMessages.findFirst.mockResolvedValue({
			messageId: "message-1",
			starboardMessageId: "starboard-message-1",
			guildId: "guild-1",
			starCount: 3,
		});
		const { reaction, send, edit } = createReaction({ count: 4 });

		await runListener(reaction);

		expect(send).not.toHaveBeenCalled();
		expect(edit).toHaveBeenCalledOnce();
		expect(dbMock.updateSet).toHaveBeenCalledWith({ starCount: 4 });
	});

	it("does nothing below the star threshold", async () => {
		const { reaction, send } = createReaction({ count: 2 });

		await runListener(reaction);

		expect(send).not.toHaveBeenCalled();
		expect(dbMock.db.insert).not.toHaveBeenCalled();
	});

	it("ignores non-star emoji and bot reactors", async () => {
		const other = createReaction({ emoji: "👍", count: 10 });
		await runListener(other.reaction);
		expect(dbMock.db.query.guildSettings.findFirst).not.toHaveBeenCalled();

		const star = createReaction({ count: 10 });
		await runListener(star.reaction, { bot: true });
		expect(star.send).not.toHaveBeenCalled();
	});
});
