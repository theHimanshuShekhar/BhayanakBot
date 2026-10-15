import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAfk } from "../../../src/db/queries/afk.js";
import { findMatchingResponse } from "../../../src/db/queries/autoResponses.js";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { generateAutoResponse, generateMentionReply } from "../../../src/lib/autoresponder/llmResponse.js";
import { replyGuardTestHooks } from "../../../src/lib/autoresponder/replyGuard.js";
import { callBackgroundLlm } from "../../../src/lib/llmProvider.js";
import { MessageCreateListener } from "../../../src/listeners/messages/messageCreate.js";
import { RandomResponderListener } from "../../../src/listeners/messages/randomResponder.js";
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
	addXp: vi.fn(async () => ({ user: {}, leveledUp: false, newLevel: 1, awarded: true })),
	getLevelRewards: vi.fn(async () => []),
}));
vi.mock("../../../src/lib/autoresponder/llmResponse.js", () => ({
	generateAutoResponse: vi.fn(),
	generateMentionReply: vi.fn(),
}));
vi.mock("../../../src/lib/llmProvider.js", () => ({
	callInteractiveLlm: vi.fn(),
	callBackgroundLlm: vi.fn(),
}));
vi.mock("../../../src/lib/personality/getPersonalityContext.js", () => ({
	getPersonalityContext: vi.fn(async () => ""),
}));
vi.mock("../../../src/lib/personality/buildProfile.js", () => ({ buildPersonalityProfile: vi.fn() }));
vi.mock("../../../src/lib/personality/buildGuildProfile.js", () => ({ buildGuildPersonalityProfile: vi.fn() }));

const mockedGetAfk = vi.mocked(getAfk);
const mockedFindMatchingResponse = vi.mocked(findMatchingResponse);
const mockedGetOrCreateSettings = vi.mocked(getOrCreateSettings);
const mockedGenerateAutoResponse = vi.mocked(generateAutoResponse);
const mockedGenerateMentionReply = vi.mocked(generateMentionReply);
const mockedCallBackgroundLlm = vi.mocked(callBackgroundLlm);

const SYSTEM_PROMPT = "You are a rude pirate. Never break character.";

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

// Each message gets its own author and id: the listeners keep module-level cooldowns and claims.
let counter = 0;

function createMessage(
	input: { channelId?: string; content?: string; botMentioned?: boolean; authorId?: string } = {},
) {
	const n = ++counter;
	const channelId = input.channelId ?? "target";
	const history = new Map([
		["h1", { author: { bot: false, displayName: "Someone" }, content: "chat about something interesting" }],
	]);
	return {
		id: `message-${n}`,
		guildId: "guild-1",
		channelId,
		content: input.content ?? "arr matey",
		createdAt: new Date(),
		reference: null,
		author: {
			id: input.authorId ?? `author-${n}`,
			bot: false,
			username: "author",
			globalName: "Author",
			send: vi.fn(),
		},
		guild: {
			id: "guild-1",
			name: "Guild",
			roles: { cache: new Map() },
			channels: { cache: new Map() },
			members: { cache: new Map() },
		},
		member: { displayName: "Author", permissions: { has: vi.fn(() => false) }, roles: { add: vi.fn() } },
		channel: {
			id: channelId,
			send: vi.fn(async () => null),
			sendTyping: vi.fn(async () => undefined),
			isSendable: () => true,
			messages: { fetch: vi.fn(async () => history) },
		},
		mentions: { users: new Map(), has: vi.fn(() => input.botMentioned ?? false) },
		client: { user: { id: "bot-user", username: "BhayanakBot" } },
		reply: vi.fn(async () => ({ delete: vi.fn(async () => null) })),
		delete: vi.fn(async () => null),
	};
}

type TestMessage = ReturnType<typeof createMessage>;

function llmRule(overrides: Record<string, unknown> = {}) {
	return {
		response: {
			id: 7,
			guildId: "guild-1",
			trigger: `ahoy-${counter}`, // the listener keeps a module-level per-trigger cooldown too
			response: SYSTEM_PROMPT,
			matchType: "contains",
			responseType: "llm",
			useRegex: false,
			channelIds: [],
			requireMention: false,
			chancePercent: 100,
			deleteTrigger: false,
			createdAt: new Date(),
			...overrides,
		},
	};
}

function createListener() {
	return new MessageCreateListener(createListenerContext("src/listeners/messages/messageCreate.ts"), {});
}

function createRandomResponder() {
	return new RandomResponderListener(createListenerContext("src/listeners/messages/randomResponder.ts"), {});
}

async function withRoll<T>(roll: number, fn: () => Promise<T>): Promise<T> {
	const spy = vi.spyOn(Math, "random").mockReturnValue(roll);
	try {
		return await fn();
	} finally {
		spy.mockRestore();
	}
}

function sentAnything(message: TestMessage) {
	return message.reply.mock.calls.length > 0 || message.channel.send.mock.calls.length > 0;
}

describe("LLM autoresponses", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		replyGuardTestHooks.reset();
		mockedGetOrCreateSettings.mockResolvedValue(createSettings());
		mockedGetAfk.mockResolvedValue(undefined as never);
		mockedFindMatchingResponse.mockResolvedValue(null as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { guilds: { cache: new Map() } } as unknown as typeof container.client;
	});

	it("does nothing when an LLM rule matches outside the target channel", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule({ deleteTrigger: true }) as never);
		const message = createMessage({ channelId: "elsewhere" });

		await createListener().run(message as never);

		expect(mockedGenerateAutoResponse).not.toHaveBeenCalled();
		expect(message.delete).not.toHaveBeenCalled();
		expect(sentAnything(message)).toBe(false);
	});

	it("never posts the admin's system prompt as text, in any channel", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule() as never);
		mockedGenerateAutoResponse.mockResolvedValue(null);
		const outside = createMessage({ channelId: "elsewhere" });
		const inside = createMessage({ channelId: "target" });

		await createListener().run(outside as never);
		await createListener().run(inside as never);

		for (const message of [outside, inside]) {
			const sent = [...message.reply.mock.calls, ...message.channel.send.mock.calls].flat();
			expect(sent.join("\n")).not.toContain(SYSTEM_PROMPT);
		}
	});

	it("does not consume cooldowns when the LLM rule is skipped outside the target channel", async () => {
		const rule = llmRule();
		mockedFindMatchingResponse.mockResolvedValue(rule as never);
		mockedGenerateAutoResponse.mockResolvedValue("Arr!");
		const authorId = "author-skipped";

		await createListener().run(createMessage({ channelId: "elsewhere", authorId }) as never);
		const inside = createMessage({ channelId: "target", authorId });
		await createListener().run(inside as never);

		expect(mockedGenerateAutoResponse).toHaveBeenCalledTimes(1);
		expect(inside.reply).toHaveBeenCalledWith("Arr!");
	});

	it("keeps the trigger and posts nothing when Zen fails, even for a delete-trigger rule", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule({ deleteTrigger: true }) as never);
		mockedGenerateAutoResponse.mockResolvedValue(null);
		const message = createMessage();

		await createListener().run(message as never);

		expect(mockedGenerateAutoResponse).toHaveBeenCalledTimes(1);
		expect(message.delete).not.toHaveBeenCalled();
		expect(sentAnything(message)).toBe(false);
	});

	it("leaves trigger and user cooldowns untouched when Zen fails", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule() as never);
		mockedGenerateAutoResponse.mockResolvedValueOnce(null).mockResolvedValueOnce("Arr!");
		const authorId = "author-retry";

		await createListener().run(createMessage({ authorId }) as never);
		const retry = createMessage({ authorId });
		await createListener().run(retry as never);

		expect(mockedGenerateAutoResponse).toHaveBeenCalledTimes(2);
		expect(retry.reply).toHaveBeenCalledWith("Arr!");
	});

	it("deletes the trigger only once the reply is ready, then starts cooldowns", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule({ deleteTrigger: true }) as never);
		const events: string[] = [];
		mockedGenerateAutoResponse.mockImplementation(async () => {
			events.push("generate");
			return "Arr!";
		});
		const message = createMessage();
		message.delete.mockImplementation(async () => {
			events.push("delete");
			return null;
		});
		message.channel.send.mockImplementation(async () => {
			events.push("send");
			return null;
		});

		await createListener().run(message as never);
		expect(events).toEqual(["generate", "delete", "send"]);

		// The same user and trigger are now on cooldown.
		const again = createMessage({ authorId: message.author.id });
		await createListener().run(again as never);
		expect(mockedGenerateAutoResponse).toHaveBeenCalledTimes(1);
	});

	it("does not start cooldowns when the reply could not be sent", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule() as never);
		mockedGenerateAutoResponse.mockResolvedValue("Arr!");
		const authorId = "author-send-fails";
		const failing = createMessage({ authorId });
		failing.reply.mockRejectedValue(new Error("Missing Permissions"));

		await createListener().run(failing as never);
		const retry = createMessage({ authorId });
		await createListener().run(retry as never);

		expect(retry.reply).toHaveBeenCalledWith("Arr!");
	});
});

describe("random AI replies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		replyGuardTestHooks.reset();
		mockedGetOrCreateSettings.mockResolvedValue(
			createSettings({ randomResponseChannelId: "target", randomResponseChance: 50 }),
		);
		mockedGetAfk.mockResolvedValue(undefined as never);
		mockedFindMatchingResponse.mockResolvedValue(null as never);
		mockedGenerateMentionReply.mockResolvedValue("random quip");
		mockedCallBackgroundLlm.mockResolvedValue("random quip");
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { guilds: { cache: new Map() } } as unknown as typeof container.client;
	});

	const paths = [
		{
			name: "messageCreate",
			run: (message: TestMessage) => createListener().run(message as never),
			llm: mockedGenerateMentionReply,
		},
		{
			name: "randomResponder",
			run: (message: TestMessage) => createRandomResponder().run(message as never),
			llm: mockedCallBackgroundLlm,
		},
	];

	describe.each(paths)("$name path", ({ run, llm }) => {
		it("replies when the roll is inside the configured chance", async () => {
			const message = createMessage();

			await withRoll(0.1, () => run(message));

			expect(llm).toHaveBeenCalledTimes(1);
			expect(message.channel.send).toHaveBeenCalledWith("random quip");
		});

		it("stays quiet when the roll misses the configured chance", async () => {
			const message = createMessage();

			await withRoll(0.9, () => run(message));

			expect(llm).not.toHaveBeenCalled();
			expect(sentAnything(message)).toBe(false);
		});

		it.each([
			["chance is 0", { randomResponseChannelId: "target", randomResponseChance: 0 }],
			["no channel is configured", { randomResponseChannelId: null, randomResponseChance: 100 }],
			["another channel is configured", { randomResponseChannelId: "somewhere-else", randomResponseChance: 100 }],
		])("stays quiet when %s", async (_label, overrides) => {
			mockedGetOrCreateSettings.mockResolvedValue(createSettings(overrides));
			const message = createMessage();

			await withRoll(0, () => run(message));

			expect(llm).not.toHaveBeenCalled();
			expect(sentAnything(message)).toBe(false);
		});

		it("holds a per-channel cooldown after a reply is sent", async () => {
			const first = createMessage();
			const second = createMessage();

			await withRoll(0, () => run(first));
			await withRoll(0, () => run(second));

			expect(first.channel.send).toHaveBeenCalledTimes(1);
			expect(llm).toHaveBeenCalledTimes(1);
			expect(sentAnything(second)).toBe(false);
		});

		it("does not start the cooldown when Zen fails", async () => {
			llm.mockResolvedValueOnce(null);
			const failed = createMessage();
			const next = createMessage();

			await withRoll(0, () => run(failed));
			await withRoll(0, () => run(next));

			expect(sentAnything(failed)).toBe(false);
			expect(next.channel.send).toHaveBeenCalledWith("random quip");
		});
	});

	it("lets the two random paths share one cooldown per channel", async () => {
		const viaListener = createMessage();
		const viaResponder = createMessage();

		await withRoll(0, () => createListener().run(viaListener as never));
		await withRoll(0, () => createRandomResponder().run(viaResponder as never));

		expect(viaListener.channel.send).toHaveBeenCalledTimes(1);
		expect(mockedCallBackgroundLlm).not.toHaveBeenCalled();
		expect(sentAnything(viaResponder)).toBe(false);
	});

	it("makes one AI call for one message when both random paths see it at once", async () => {
		const message = createMessage();

		await withRoll(0, () =>
			Promise.all([createRandomResponder().run(message as never), createListener().run(message as never)]),
		);

		expect(mockedCallBackgroundLlm.mock.calls.length + mockedGenerateMentionReply.mock.calls.length).toBe(1);
		expect(message.channel.send).toHaveBeenCalledTimes(1);
	});

	it("does not start a second random reply in a channel while one is being generated", async () => {
		let release: (value: string) => void = () => undefined;
		mockedCallBackgroundLlm.mockImplementationOnce(() => new Promise<string>((resolve) => (release = resolve)));
		const first = createMessage();
		const second = createMessage();

		const pending = withRoll(0, () => createRandomResponder().run(first as never));
		await vi.waitFor(() => expect(mockedCallBackgroundLlm).toHaveBeenCalledTimes(1));
		await withRoll(0, () => createRandomResponder().run(second as never));
		release("random quip");
		await pending;

		expect(mockedCallBackgroundLlm).toHaveBeenCalledTimes(1);
		expect(sentAnything(second)).toBe(false);
	});

	it("skips the random reply when an LLM autoresponse already answered the message", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule() as never);
		mockedGenerateAutoResponse.mockResolvedValue("Arr!");
		const message = createMessage();

		await withRoll(0, () => createListener().run(message as never));

		expect(message.reply).toHaveBeenCalledWith("Arr!");
		expect(mockedGenerateMentionReply).not.toHaveBeenCalled();
		expect(message.channel.send).not.toHaveBeenCalled();
	});

	it("skips the random reply when a static autoresponse already answered the message", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule({ responseType: "static", response: "static hi" }) as never);
		const message = createMessage();

		await withRoll(0, () => createListener().run(message as never));

		expect(message.reply).toHaveBeenCalledWith("static hi");
		expect(mockedGenerateMentionReply).not.toHaveBeenCalled();
	});

	it("skips the random reply when a smart mention already answered the message", async () => {
		mockedGenerateMentionReply.mockResolvedValue("smart reply");
		const message = createMessage({ content: "<@bot-user> roast me", botMentioned: true });

		await withRoll(0, () => createListener().run(message as never));

		expect(mockedGenerateMentionReply).toHaveBeenCalledTimes(1);
		expect(message.reply).toHaveBeenCalledWith("smart reply");
		expect(message.channel.send).not.toHaveBeenCalled();
	});

	it("lets the randomResponder path skip a message the messageCreate listener already answered directly", async () => {
		mockedFindMatchingResponse.mockResolvedValue(llmRule() as never);
		mockedGenerateAutoResponse.mockResolvedValue("Arr!");
		const message = createMessage();

		await withRoll(0, () => createListener().run(message as never));
		await withRoll(0, () => createRandomResponder().run(message as never));

		expect(mockedCallBackgroundLlm).not.toHaveBeenCalled();
		expect(message.channel.send).not.toHaveBeenCalled();
	});
});
