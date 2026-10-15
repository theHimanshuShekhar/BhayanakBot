import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuessWhoCommand } from "../../../src/commands/games/guess-who.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { pickLiveGuessWhoMessage } from "../../../src/lib/guessWho/pick.js";
import { getGuessWhoSession } from "../../../src/lib/guessWho/session.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/guessWho/pick.js", () => ({ pickLiveGuessWhoMessage: vi.fn() }));

const AUTHOR_ID = "111111111111111111";
const WRONG_ID = "222222222222222222";
const PLAYER_ID = "333333333333333333";

const archivedMessage = {
	messageId: "m1",
	guildId: "g1",
	channelId: GUESS_WHO_CHANNEL_ID,
	authorUserId: AUTHOR_ID,
	authorDisplayName: "Author",
	content: "An archived message worth guessing.",
	messageCreatedAt: new Date("2026-05-27T12:00:00.000Z"),
};

/** Mimics discord.js: `stop` ends the collector once and emits `end` synchronously. */
class FakeCollector extends EventEmitter {
	ended = false;
	stop(reason: string) {
		if (this.ended) return;
		this.ended = true;
		this.emit("end", new Map(), reason);
	}
}

function setup() {
	const collector = new FakeCollector();
	const promptReply = { id: "prompt-1", edit: vi.fn().mockResolvedValue(undefined) };
	const channel = {
		isTextBased: () => true,
		createMessageCollector: vi.fn(() => collector),
		send: vi.fn().mockResolvedValue(undefined),
	};
	const interaction = {
		guildId: "g1",
		channelId: GUESS_WHO_CHANNEL_ID,
		channel,
		user: { id: PLAYER_ID },
		reply: vi.fn().mockResolvedValue(undefined),
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		fetchReply: vi.fn().mockResolvedValue(promptReply),
	};
	const command = new GuessWhoCommand(createCommandContext("src/commands/games/guess-who.ts"), {});
	return { collector, promptReply, channel, interaction, command };
}

const guess = (content: string, authorId = "444444444444444444") => ({
	content,
	author: { id: authorId, bot: false },
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function startRound() {
	const ctx = setup();
	await ctx.command.chatInputRun(ctx.interaction as never);
	expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeDefined();
	return ctx;
}

describe("/guess_who round lifecycle", () => {
	beforeEach(() => {
		setupSapphireContainer();
		vi.mocked(pickLiveGuessWhoMessage).mockResolvedValue(archivedMessage as never);
	});

	afterEach(async () => {
		// Whatever a test left running must not leak into the next one.
		const { clearGuessWhoSession } = await import("../../../src/lib/guessWho/session.js");
		clearGuessWhoSession(GUESS_WHO_CHANNEL_ID);
		vi.clearAllMocks();
	});

	it("does not spend a guess on a reply that has no typed mention", async () => {
		const { collector } = await startRound();

		// A reply ping puts the replied-to user in `mentions` but not in the text.
		collector.emit("collect", { ...guess("no way that was them"), mentions: { users: new Map([[WRONG_ID, {}]]) } });
		await flush();

		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)?.wrongGuesses).toBe(0);
	});

	it("spends a guess on a typed wrong mention", async () => {
		const { collector } = await startRound();

		collector.emit("collect", guess(`maybe <@${WRONG_ID}>`));
		await flush();

		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)?.wrongGuesses).toBe(1);
	});

	it("reveals and clears the session on a correct typed guess", async () => {
		const { collector, promptReply } = await startRound();

		collector.emit("collect", guess(`<@${AUTHOR_ID}>`));
		await flush();

		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeUndefined();
		expect(promptReply.edit).toHaveBeenCalledTimes(1);
		expect(collector.ended).toBe(true);
	});

	it("reveals and clears the session when the wrong-guess limit is reached", async () => {
		const { collector, promptReply } = await startRound();

		for (let i = 0; i < 3; i++) collector.emit("collect", guess(`<@${WRONG_ID}>`));
		await flush();

		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeUndefined();
		expect(promptReply.edit).toHaveBeenCalled();
		expect(collector.ended).toBe(true);
	});

	it("reveals and clears the session on timeout", async () => {
		const { collector, promptReply } = await startRound();

		collector.stop("time");
		await flush();

		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeUndefined();
		expect(promptReply.edit).toHaveBeenCalledTimes(1);
	});

	it("clears the session when the collector ends for any other reason", async () => {
		const { collector } = await startRound();

		collector.stop("channelDelete");
		await flush();

		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeUndefined();
	});

	it("allows a new round after one ended early", async () => {
		const { collector } = await startRound();
		collector.stop("channelDelete");
		await flush();

		const second = setup();
		await second.command.chatInputRun(second.interaction as never);

		expect(second.interaction.reply).not.toHaveBeenCalled();
		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeDefined();
	});

	it("does not start a round when no live message can be picked", async () => {
		vi.mocked(pickLiveGuessWhoMessage).mockResolvedValue(null);
		const { command, interaction } = setup();

		await command.chatInputRun(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("archived chat history"));
		expect(getGuessWhoSession(GUESS_WHO_CHANNEL_ID)).toBeUndefined();
	});
});
