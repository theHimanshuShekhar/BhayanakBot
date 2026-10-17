import { container } from "@sapphire/framework";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAfk, getAfk } from "../../../src/db/queries/afk.js";
import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import { findMatchingResponse } from "../../../src/db/queries/autoResponses.js";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { createCase } from "../../../src/db/queries/modCases.js";
import { addXp } from "../../../src/db/queries/users.js";
import { replyGuardTestHooks } from "../../../src/lib/autoresponder/replyGuard.js";
import { MessageCreateListener } from "../../../src/listeners/messages/messageCreate.js";
import { createListenerContext } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/constants.js", () => ({
	GUESS_WHO_CHANNEL_ID: "guess-who",
	TARGET_GUILD_ID: "guild-1",
	GUESS_WHO_BACKFILL_LIMIT: 1000,
	BOT_OWNER_ID: "bot-owner",
}));
vi.mock("../../../src/lib/database.js", () => ({ db: {} }));
vi.mock("../../../src/db/queries/afk.js", () => ({ clearAfk: vi.fn(), getAfk: vi.fn(async () => null) }));
vi.mock("../../../src/db/queries/archivedChannelMessages.js", () => ({
	upsertArchivedChannelMessage: vi.fn(async () => ({ inserted: true, deleted: false })),
}));
vi.mock("../../../src/db/queries/autoResponses.js", () => ({ findMatchingResponse: vi.fn(async () => null) }));
vi.mock("../../../src/db/queries/guildPersonality.js", () => ({ getGuildPersonalityProfile: vi.fn(async () => null) }));
vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));
vi.mock("../../../src/db/queries/modCases.js", () => ({ createCase: vi.fn() }));
vi.mock("../../../src/db/queries/users.js", () => ({
	addXp: vi.fn(async () => ({ user: {}, leveledUp: false, newLevel: 1, awarded: true })),
	getLevelRewards: vi.fn(async () => []),
}));
vi.mock("../../../src/lib/llmProvider.js", () => ({ callInteractiveLlm: vi.fn(), callBackgroundLlm: vi.fn() }));
vi.mock("../../../src/lib/personality/getPersonalityContext.js", () => ({
	getPersonalityContext: vi.fn(async () => ""),
}));
vi.mock("../../../src/lib/personality/buildProfile.js", () => ({ buildPersonalityProfile: vi.fn() }));
vi.mock("../../../src/lib/personality/buildGuildProfile.js", () => ({ buildGuildPersonalityProfile: vi.fn() }));

const mockedGetAfk = vi.mocked(getAfk);
const mockedClearAfk = vi.mocked(clearAfk);
const mockedUpsertArchive = vi.mocked(upsertArchivedChannelMessage);
const mockedFindMatchingResponse = vi.mocked(findMatchingResponse);
const mockedGetOrCreateSettings = vi.mocked(getOrCreateSettings);
const mockedCreateCase = vi.mocked(createCase);
const mockedAddXp = vi.mocked(addXp);

function createSettings(overrides: Record<string, unknown> = {}) {
	return {
		guildId: "guild-1",
		personalityEnabled: false,
		autoModEnabled: false,
		autoModAction: "warn",
		autoModSpamThreshold: null,
		autoModBadLinks: false,
		autoModMaxMentions: null,
		xpCooldownSeconds: 60,
		xpRate: 10,
		randomResponseChannelId: null,
		randomResponseChance: 0,
		levelUpChannelId: null,
		levelUpMessage: null,
		logChannelId: null,
		...overrides,
	} as never;
}

let counter = 0;

function createMessage(
	input: { channelId?: string; content?: string; mentionedIds?: string[]; authorId?: string } = {},
) {
	const n = ++counter;
	const channelId = input.channelId ?? "other";
	const mentionedUsers = new Map((input.mentionedIds ?? []).map((id) => [id, { id, username: `name-${id}` }] as const));
	return {
		id: `message-${n}`,
		channelId,
		content: input.content ?? "just chatting here",
		createdAt: new Date(),
		reference: null,
		author: {
			id: input.authorId ?? `author-${n}`,
			bot: false,
			username: "author",
			globalName: "Author",
			send: vi.fn(async () => null),
		},
		guild: {
			id: "guild-1",
			name: "Guild",
			roles: { cache: new Map() },
			channels: { cache: new Map() },
			members: { cache: new Map() },
		},
		member: { displayName: "Author", permissions: { has: vi.fn(() => false) }, roles: { add: vi.fn() } },
		channel: { id: channelId, send: vi.fn(async () => null), messages: { fetch: vi.fn() } },
		mentions: { users: mentionedUsers, has: vi.fn(() => false) },
		client: { user: { id: "bot-user", username: "BhayanakBot" } },
		reply: vi.fn(async () => ({ delete: vi.fn(async () => null) })),
		delete: vi.fn(async () => null),
	};
}

function createListener() {
	return new MessageCreateListener(createListenerContext("src/listeners/messages/messageCreate.ts"), {});
}

// The listener keeps a module-level per-trigger cooldown, so each response gets its own trigger.
let triggerCounter = 0;

function staticResponse(trigger = `trigger-${++triggerCounter}`) {
	return {
		response: {
			id: 1,
			guildId: "guild-1",
			trigger,
			response: "static hello",
			matchType: "contains",
			responseType: "static",
			useRegex: false,
			channelIds: [],
			requireMention: false,
			chancePercent: 100,
			deleteTrigger: false,
			createdAt: new Date(),
		},
	};
}

const BAD_LINK = "join https://discord.gg/abc now";

describe("messageCreate stage isolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		replyGuardTestHooks.reset();
		mockedGetOrCreateSettings.mockResolvedValue(createSettings());
		mockedGetAfk.mockResolvedValue(undefined as never);
		mockedFindMatchingResponse.mockResolvedValue(null as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { guilds: { cache: new Map() } } as unknown as typeof container.client;
	});

	it("still awards XP and answers autoresponses when the AFK welcome-back reply is rejected", async () => {
		mockedGetAfk.mockImplementation((async (userId: string, _guildId: string) =>
			userId.startsWith("author-") ? { reason: null, setAt: new Date() } : undefined) as never);
		mockedFindMatchingResponse.mockResolvedValue(staticResponse() as never);
		const message = createMessage();
		message.reply.mockRejectedValueOnce(new Error("Missing Permissions"));

		await createListener().run(message as never);

		expect(mockedClearAfk).toHaveBeenCalledTimes(1);
		expect(mockedAddXp).toHaveBeenCalledTimes(1);
		// The failed AFK reply was the first reply; the autoresponse is the second and goes through.
		expect(message.reply).toHaveBeenCalledWith("static hello");
		expect(container.logger.error).toHaveBeenCalledWith("[messageCreate] stage=afk-clear failed", expect.any(Error));
	});

	it("still notifies mentioned AFK users when clearing the author's AFK status fails", async () => {
		mockedGetAfk.mockImplementation((async (userId: string) =>
			userId === "afk-user" || userId.startsWith("author-")
				? { reason: "brb", setAt: new Date() }
				: undefined) as never);
		mockedClearAfk.mockRejectedValueOnce(new Error("db down"));
		const message = createMessage({ mentionedIds: ["afk-user"] });

		await createListener().run(message as never);

		expect(message.channel.send).toHaveBeenCalledTimes(1);
		expect(mockedAddXp).toHaveBeenCalledTimes(1);
	});

	it("still awards XP and answers autoresponses when the archive write fails", async () => {
		mockedUpsertArchive.mockRejectedValueOnce(new Error("db down"));
		mockedFindMatchingResponse.mockResolvedValue(staticResponse() as never);
		const message = createMessage({ channelId: "guess-who" });

		await createListener().run(message as never);

		expect(mockedAddXp).toHaveBeenCalledTimes(1);
		expect(message.reply).toHaveBeenCalledWith("static hello");
		expect(container.logger.error).toHaveBeenCalled();
	});

	it("still answers autoresponses when the XP award fails", async () => {
		mockedAddXp.mockRejectedValueOnce(new Error("db down"));
		mockedFindMatchingResponse.mockResolvedValue(staticResponse() as never);
		const message = createMessage();

		await createListener().run(message as never);

		expect(message.reply).toHaveBeenCalledWith("static hello");
		expect(container.logger.error).toHaveBeenCalledWith("[messageCreate] stage=xp failed", expect.any(Error));
	});

	it("does not put message content in the stage failure log", async () => {
		mockedAddXp.mockRejectedValueOnce(new Error("db down"));
		const message = createMessage({ content: "super secret words" });

		await createListener().run(message as never);

		const logged = JSON.stringify(vi.mocked(container.logger.error).mock.calls.map(([line]) => line));
		expect(logged).not.toContain("super secret words");
	});
});

describe("messageCreate auto-mod removal stops everything else", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		replyGuardTestHooks.reset();
		mockedGetAfk.mockResolvedValue({ reason: null, setAt: new Date() } as never);
		mockedFindMatchingResponse.mockResolvedValue(staticResponse() as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { guilds: { cache: new Map() } } as unknown as typeof container.client;
	});

	it("deletes the message and creates one case, with no XP, AFK, archive, reply, or AI reply", async () => {
		mockedGetOrCreateSettings.mockResolvedValue(createSettings({ autoModEnabled: true, autoModBadLinks: true }));
		const message = createMessage({ channelId: "guess-who", content: BAD_LINK });

		await createListener().run(message as never);

		expect(message.delete).toHaveBeenCalledTimes(1);
		expect(mockedCreateCase).toHaveBeenCalledTimes(1);
		expect(mockedAddXp).not.toHaveBeenCalled();
		expect(mockedUpsertArchive).not.toHaveBeenCalled();
		expect(mockedGetAfk).not.toHaveBeenCalled();
		expect(mockedFindMatchingResponse).not.toHaveBeenCalled();
		expect(message.reply).not.toHaveBeenCalled();
		expect(message.channel.send).not.toHaveBeenCalled();
	});

	it("creates exactly one case when several rules match, the first rule winning", async () => {
		mockedGetOrCreateSettings.mockResolvedValue(
			createSettings({ autoModEnabled: true, autoModBadLinks: true, autoModMaxMentions: 2 }),
		);
		const message = createMessage({ content: BAD_LINK, mentionedIds: ["a", "b", "c"] });

		await createListener().run(message as never);

		expect(message.delete).toHaveBeenCalledTimes(1);
		expect(mockedCreateCase).toHaveBeenCalledTimes(1);
		expect(mockedCreateCase).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "[Auto-Mod] Unauthorized invite/link" }),
		);
	});

	it("creates one case when spam and a bad link match the same message", async () => {
		mockedGetOrCreateSettings.mockResolvedValue(
			createSettings({ autoModEnabled: true, autoModBadLinks: true, autoModSpamThreshold: 2 }),
		);
		const authorId = "spammer-1";
		const first = createMessage({ authorId, content: "hello there" });
		const second = createMessage({ authorId, content: BAD_LINK });

		await createListener().run(first as never);
		expect(first.delete).not.toHaveBeenCalled();
		expect(mockedAddXp).toHaveBeenCalledTimes(1);

		await createListener().run(second as never);

		expect(second.delete).toHaveBeenCalledTimes(1);
		expect(mockedCreateCase).toHaveBeenCalledTimes(1);
		expect(mockedCreateCase).toHaveBeenCalledWith(expect.objectContaining({ reason: "[Auto-Mod] Spam detected" }));
		expect(mockedAddXp).toHaveBeenCalledTimes(1);
	});

	it("still stops the message when deleting it fails", async () => {
		mockedGetOrCreateSettings.mockResolvedValue(createSettings({ autoModEnabled: true, autoModBadLinks: true }));
		const message = createMessage({ content: BAD_LINK });
		message.delete.mockRejectedValueOnce(new Error("Missing Permissions"));

		await createListener().run(message as never);

		expect(mockedCreateCase).toHaveBeenCalledTimes(1);
		expect(mockedAddXp).not.toHaveBeenCalled();
	});

	it("leaves administrators and clean messages alone", async () => {
		mockedGetOrCreateSettings.mockResolvedValue(createSettings({ autoModEnabled: true, autoModBadLinks: true }));
		const admin = createMessage({ content: BAD_LINK });
		admin.member.permissions.has.mockReturnValue(true);

		await createListener().run(admin as never);

		expect(admin.delete).not.toHaveBeenCalled();
		expect(mockedCreateCase).not.toHaveBeenCalled();
		expect(mockedAddXp).toHaveBeenCalledTimes(1);
	});
});

describe("messageCreate cooldown maps", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		replyGuardTestHooks.reset();
		vi.useFakeTimers({ toFake: ["Date"] });
		mockedGetOrCreateSettings.mockResolvedValue(createSettings());
		mockedGetAfk.mockResolvedValue(undefined as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { guilds: { cache: new Map() } } as unknown as typeof container.client;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("evicts auto-responder cooldown entries once their cooldown has passed", async () => {
		const respond = async (trigger: string) => {
			mockedFindMatchingResponse.mockResolvedValue(staticResponse(trigger) as never);
			await createListener().run(createMessage() as never);
		};

		await respond("evict-a");
		await respond("evict-b");
		expect(replyGuardTestHooks.sizes().trigger).toBeGreaterThanOrEqual(2);

		vi.advanceTimersByTime(11 * 60 * 1000);
		await respond("evict-c");

		expect(replyGuardTestHooks.sizes().trigger).toBe(1);
		expect(replyGuardTestHooks.sizes().user).toBe(1);
	});
});
