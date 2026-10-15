import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { callInteractiveLlm } from "../../../src/lib/llmProvider.js";
import { MentionResponderListener } from "../../../src/listeners/messages/mentionResponder.js";
import { RandomResponderListener } from "../../../src/listeners/messages/randomResponder.js";
import { createListenerContext } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/constants.js", () => ({
	GUESS_WHO_CHANNEL_ID: "guess-who",
	TARGET_TEXT_CHANNEL_ID: "target",
	TARGET_GUILD_ID: "home-guild",
	GUESS_WHO_BACKFILL_LIMIT: 1000,
	BOT_OWNER_ID: undefined,
}));
vi.mock("../../../src/db/queries/guildSettings.js", () => ({
	getOrCreateSettings: vi.fn(async () => ({ personalityEnabled: false })),
}));
vi.mock("../../../src/lib/llmProvider.js", () => ({ callInteractiveLlm: vi.fn(async () => "a witty reply") }));
vi.mock("../../../src/lib/personality/getPersonalityContext.js", () => ({
	getPersonalityContext: vi.fn(async () => ""),
}));

const mockedCallInteractiveLlm = vi.mocked(callInteractiveLlm);
const mockedGetOrCreateSettings = vi.mocked(getOrCreateSettings);

let authorCounter = 0;

function createMessage(guildId: string) {
	const history = new Map([
		["1", { author: { bot: false, displayName: "Someone" }, content: "chat about something interesting" }],
	]);
	return {
		author: { id: `author-${++authorCounter}`, bot: false, displayName: "Author" },
		guildId,
		channelId: "target",
		content: "<@bot-user> roast me",
		inGuild: () => true,
		mentions: { has: vi.fn(() => true) },
		client: { user: { id: "bot-user" } },
		channel: {
			isTextBased: () => true,
			isSendable: () => true,
			sendTyping: vi.fn(async () => undefined),
			send: vi.fn(async () => undefined),
			messages: { fetch: vi.fn(async () => history) },
		},
		reply: vi.fn(async () => undefined),
	};
}

describe("passive responders outside the Home Server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("mentionResponder replies in the Home Server", async () => {
		const message = createMessage("home-guild");
		const listener = new MentionResponderListener(
			createListenerContext("src/listeners/messages/mentionResponder.ts"),
			{},
		);

		await listener.run(message as never);

		expect(mockedCallInteractiveLlm).toHaveBeenCalledTimes(1);
		expect(message.reply).toHaveBeenCalledWith("a witty reply");
	});

	it("mentionResponder does not touch the LLM, the database, or the channel in another guild", async () => {
		const message = createMessage("foreign-guild");
		const listener = new MentionResponderListener(
			createListenerContext("src/listeners/messages/mentionResponder.ts"),
			{},
		);

		await listener.run(message as never);

		expect(mockedGetOrCreateSettings).not.toHaveBeenCalled();
		expect(message.channel.messages.fetch).not.toHaveBeenCalled();
		expect(mockedCallInteractiveLlm).not.toHaveBeenCalled();
		expect(message.reply).not.toHaveBeenCalled();
	});

	// First draw sets the chance (0.5 * 0.02), second draw (0) is below it, so the roll always fires.
	async function runRandomResponder(message: ReturnType<typeof createMessage>) {
		const listener = new RandomResponderListener(
			createListenerContext("src/listeners/messages/randomResponder.ts"),
			{},
		);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValue(0);
		try {
			await listener.run(message as never);
		} finally {
			randomSpy.mockRestore();
		}
	}

	it("randomResponder chimes in when the roll fires in the Home Server", async () => {
		const message = createMessage("home-guild");

		await runRandomResponder(message);

		expect(mockedCallInteractiveLlm).toHaveBeenCalledTimes(1);
		expect(message.channel.send).toHaveBeenCalledWith("a witty reply");
	});

	it("randomResponder never reads or sends chat in another guild", async () => {
		const message = createMessage("foreign-guild");

		await runRandomResponder(message);

		expect(message.channel.messages.fetch).not.toHaveBeenCalled();
		expect(mockedCallInteractiveLlm).not.toHaveBeenCalled();
		expect(message.channel.send).not.toHaveBeenCalled();
	});
});
