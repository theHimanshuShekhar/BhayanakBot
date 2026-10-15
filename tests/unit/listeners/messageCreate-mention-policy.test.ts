import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAfk } from "../../../src/db/queries/afk.js";
import { findMatchingResponse } from "../../../src/db/queries/autoResponses.js";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { addXp } from "../../../src/db/queries/users.js";
import { generateAutoResponse, generateMentionReply } from "../../../src/lib/autoresponder/llmResponse.js";
import { MessageCreateListener } from "../../../src/listeners/messages/messageCreate.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";
import { createListenerContext } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/constants.js", () => ({
	GUESS_WHO_CHANNEL_ID: "guess-who",
	TARGET_TEXT_CHANNEL_ID: "target",
	TARGET_GUILD_ID: "guild-1",
	GUESS_WHO_BACKFILL_LIMIT: 1000,
	BOT_OWNER_ID: "bot-owner",
}));
vi.mock("../../../src/lib/database.js", () => ({ db: {} }));
vi.mock("../../../src/db/queries/afk.js", () => ({ clearAfk: vi.fn(), getAfk: vi.fn(async () => null) }));
vi.mock("../../../src/db/queries/archivedChannelMessages.js", () => ({ upsertArchivedChannelMessage: vi.fn() }));
vi.mock("../../../src/db/queries/autoResponses.js", () => ({ findMatchingResponse: vi.fn(async () => null) }));
vi.mock("../../../src/db/queries/guildPersonality.js", () => ({ getGuildPersonalityProfile: vi.fn(async () => null) }));
vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));
vi.mock("../../../src/db/queries/modCases.js", () => ({ createCase: vi.fn() }));
vi.mock("../../../src/db/queries/users.js", () => ({
	addXp: vi.fn(async () => ({ user: { lastMessageAt: new Date() }, leveledUp: false, newLevel: 1 })),
	getLevelRewards: vi.fn(async () => []),
}));
vi.mock("../../../src/lib/autoresponder/llmResponse.js", () => ({
	generateAutoResponse: vi.fn(),
	generateMentionReply: vi.fn(),
}));
vi.mock("../../../src/lib/personality/getPersonalityContext.js", () => ({
	getPersonalityContext: vi.fn(async () => ""),
}));
vi.mock("../../../src/lib/personality/buildProfile.js", () => ({ buildPersonalityProfile: vi.fn() }));
vi.mock("../../../src/lib/personality/buildGuildProfile.js", () => ({ buildGuildPersonalityProfile: vi.fn() }));

const mockedGetAfk = vi.mocked(getAfk);
const mockedFindMatchingResponse = vi.mocked(findMatchingResponse);
const mockedGetOrCreateSettings = vi.mocked(getOrCreateSettings);
const mockedAddXp = vi.mocked(addXp);
const mockedGenerateAutoResponse = vi.mocked(generateAutoResponse);
const mockedGenerateMentionReply = vi.mocked(generateMentionReply);

function createSettings(overrides: Record<string, unknown> = {}) {
	return {
		guildId: "guild-1",
		personalityEnabled: true,
		autoModEnabled: false,
		xpCooldownSeconds: 60,
		xpRate: 10,
		randomResponseChannelId: null,
		randomResponseChance: 0,
		levelUpChannelId: null,
		levelUpMessage: null,
		...overrides,
	} as never;
}

// Each message gets its own author: the listener keeps module-level per-user cooldowns.
let authorCounter = 0;

function createMessage(input: { id: string; channelId?: string; content?: string; mentionedIds?: string[] }) {
	const authorId = `author-${++authorCounter}`;
	const mentionedUsers = new Map((input.mentionedIds ?? []).map((id) => [id, { id, username: `name-${id}` }] as const));
	return {
		id: input.id,
		channelId: input.channelId ?? "other",
		content: input.content ?? "just chatting here",
		createdAt: new Date(),
		reference: null,
		author: { id: authorId, bot: false, username: "author", globalName: "Author", send: vi.fn() },
		guild: {
			id: "guild-1",
			name: "Guild",
			roles: { cache: new Map() },
			channels: { cache: new Map() },
			members: { cache: new Map() },
		},
		member: { displayName: "Author", permissions: { has: vi.fn(() => false) }, roles: { add: vi.fn() } },
		channel: { id: input.channelId ?? "other", send: vi.fn(async () => null), messages: { fetch: vi.fn() } },
		mentions: { users: mentionedUsers, has: vi.fn(() => false) },
		client: { user: { id: "bot-user", username: "BhayanakBot" } },
		reply: vi.fn(async () => ({ delete: vi.fn(async () => null) })),
		delete: vi.fn(async () => null),
	};
}

function createListener() {
	return new MessageCreateListener(createListenerContext("src/listeners/messages/messageCreate.ts"), {});
}

function staticResponse(response: string) {
	return {
		response: {
			id: 1,
			guildId: "guild-1",
			trigger: `trigger-${authorCounter}`, // the listener keeps a module-level per-trigger cooldown too
			response,
			matchType: "contains",
			responseType: "static",
			useRegex: true,
			channelIds: [],
			requireMention: false,
			chancePercent: 100,
			deleteTrigger: false,
			createdAt: new Date(),
		},
	};
}

describe("messageCreate Mention Policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedGetOrCreateSettings.mockResolvedValue(createSettings());
		mockedGetAfk.mockResolvedValue(undefined as never);
		mockedFindMatchingResponse.mockResolvedValue(null as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { guilds: { cache: new Map() } } as unknown as typeof container.client;
	});

	it("posts an AFK reason containing @everyone and a role mention without notifying anyone", async () => {
		mockedGetAfk.mockImplementation((async (userId: string) =>
			userId === "afk-user" ? { reason: "@everyone <@&555> brb", setAt: new Date() } : undefined) as never);
		const message = createMessage({ id: "afk-1", mentionedIds: ["afk-user"] });

		await createListener().run(message as never);

		expect(message.channel.send).toHaveBeenCalledTimes(1);
		const [sent] = message.channel.send.mock.calls[0] as unknown as [string];
		expect(sent).toContain("@everyone <@&555> brb");
		expect(resolveAllowedMentions(sent)).toEqual(NOTIFIES_NOBODY);
	});

	it("echoes a regex capture such as 'my name is @everyone' without notifying anyone", async () => {
		mockedFindMatchingResponse.mockResolvedValue({
			...staticResponse("Nice to meet you, {name}!"),
			captured: { name: "@everyone" },
		} as never);
		const message = createMessage({ id: "regex-1", content: "my name is @everyone" });

		await createListener().run(message as never);

		expect(message.reply).toHaveBeenCalledTimes(1);
		const [sent] = message.reply.mock.calls[0] as unknown as [string];
		expect(sent).toBe("Nice to meet you, @everyone!");
		expect(resolveAllowedMentions(sent)).toEqual(NOTIFIES_NOBODY);
	});

	it("notifies nobody, including the author, for an LLM autoresponder reply that renders mentions", async () => {
		mockedFindMatchingResponse.mockResolvedValue({
			response: { ...staticResponse("Be rude.").response, responseType: "llm" },
		} as never);
		const message = createMessage({ id: "llm-1", channelId: "target" });
		mockedGenerateAutoResponse.mockResolvedValue(`<@${message.author.id}> and <@111> and @everyone and <@&555>`);

		await createListener().run(message as never);

		const [sent] = message.reply.mock.calls[0] as unknown as [string];
		expect(sent).toContain(`<@${message.author.id}>`);
		expect(resolveAllowedMentions(sent)).toEqual(NOTIFIES_NOBODY);
	});

	it("notifies nobody, including the author, for a smart mention reply", async () => {
		const message = createMessage({ id: "smart-1", channelId: "target", content: "<@bot-user> roast me" });
		mockedGenerateMentionReply.mockResolvedValue(`<@${message.author.id}> shut up @here`);
		message.mentions.has = vi.fn(() => true);

		await createListener().run(message as never);

		const [sent] = message.reply.mock.calls[0] as unknown as [string];
		expect(sent).toContain("@here");
		expect(resolveAllowedMentions(sent)).toEqual(NOTIFIES_NOBODY);
	});

	it("notifies nobody for a random chat reply", async () => {
		mockedGetOrCreateSettings.mockResolvedValue(
			createSettings({ randomResponseChannelId: "target", randomResponseChance: 100 }),
		);
		const message = createMessage({ id: "random-1", channelId: "target" });
		mockedGenerateMentionReply.mockResolvedValue(`<@${message.author.id}> lol @everyone`);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

		try {
			await createListener().run(message as never);
		} finally {
			randomSpy.mockRestore();
		}

		const [sent] = message.channel.send.mock.calls[0] as unknown as [string];
		expect(sent).toContain(`<@${message.author.id}>`);
		expect(resolveAllowedMentions(sent)).toEqual(NOTIFIES_NOBODY);
	});

	it("notifies only the levelled-up member on level-up", async () => {
		mockedAddXp.mockResolvedValueOnce({ user: { lastMessageAt: new Date(0) } } as never);
		mockedAddXp.mockResolvedValueOnce({ user: {}, leveledUp: true, newLevel: 5 } as never);
		mockedGetOrCreateSettings.mockResolvedValue(createSettings({ levelUpMessage: "{user} hit {level} @everyone" }));
		const message = createMessage({ id: "level-1" });

		await createListener().run(message as never);

		const [sent] = message.channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		expect(sent.content).toBe(`<@${message.author.id}> hit 5 @everyone`);
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: [message.author.id] });
	});
});
