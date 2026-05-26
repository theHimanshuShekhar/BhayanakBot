import { afterEach, describe, expect, it } from "vitest";
import {
	clearGuessWhoSession,
	createGuessWhoSession,
	GUESS_WHO_MAX_WRONG_GUESSES,
	GUESS_WHO_TIMEOUT_MS,
	getGuessWhoSession,
	recordWrongGuess,
} from "../../../src/lib/guessWho/session.js";

describe("guess who sessions", () => {
	afterEach(() => {
		clearGuessWhoSession("channel-1");
	});

	it("creates one active session per channel", () => {
		const timeout = setTimeout(() => undefined, 1);
		createGuessWhoSession({
			channelId: "channel-1",
			messageId: "prompt-1",
			authorUserId: "author-1",
			wrongGuesses: 0,
			timeout,
		});

		expect(getGuessWhoSession("channel-1")?.messageId).toBe("prompt-1");
		expect(() =>
			createGuessWhoSession({
				channelId: "channel-1",
				messageId: "prompt-2",
				authorUserId: "author-2",
				wrongGuesses: 0,
				timeout,
			}),
		).toThrow("A Guess Who round is already active in this channel.");
	});

	it("tracks remaining global wrong guesses", () => {
		const timeout = setTimeout(() => undefined, 1);
		createGuessWhoSession({
			channelId: "channel-1",
			messageId: "prompt-1",
			authorUserId: "author-1",
			wrongGuesses: 0,
			timeout,
		});

		expect(recordWrongGuess("channel-1")).toEqual({ wrongGuesses: 1, remainingGuesses: 2, exhausted: false });
		expect(recordWrongGuess("channel-1")).toEqual({ wrongGuesses: 2, remainingGuesses: 1, exhausted: false });
		expect(recordWrongGuess("channel-1")).toEqual({ wrongGuesses: 3, remainingGuesses: 0, exhausted: true });
	});

	it("uses a ten minute timeout and three wrong guesses", () => {
		expect(GUESS_WHO_TIMEOUT_MS).toBe(10 * 60 * 1000);
		expect(GUESS_WHO_MAX_WRONG_GUESSES).toBe(3);
	});
});
