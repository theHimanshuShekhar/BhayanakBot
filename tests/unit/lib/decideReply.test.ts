import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchResult } from "../../../src/db/queries/autoResponses.js";
import { decideReply, isBotMentioned, rollRandomReply } from "../../../src/lib/autoresponder/decideReply.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";

const ACTIVE = { messages: 5, members: 2, sinceLastReply: 30 };

const match = { response: { id: 1 } } as unknown as MatchResult;

function decide(overrides: Partial<Parameters<typeof decideReply>[0]> = {}) {
	return decideReply({
		match: undefined,
		isHomeServer: true,
		botMentioned: false,
		rollRandom: () => false,
		...overrides,
	});
}

describe("decideReply (One Reply Rule)", () => {
	it("answers with a matching autoresponse before a mention or a random reply", () => {
		const rollRandom = vi.fn(() => true);

		expect(decide({ match, botMentioned: true, rollRandom })).toEqual({ kind: "autoresponse", match });
		expect(rollRandom).not.toHaveBeenCalled();
	});

	it("keeps the message for the autoresponse outside the Home Server too", () => {
		expect(decide({ match, isHomeServer: false, botMentioned: true })).toEqual({ kind: "autoresponse", match });
	});

	it("answers a bot mention before a random reply, without rolling", () => {
		const rollRandom = vi.fn(() => true);

		expect(decide({ botMentioned: true, rollRandom })).toEqual({ kind: "mention" });
		expect(rollRandom).not.toHaveBeenCalled();
	});

	it("posts a random reply only when nothing else answers and the roll hits", () => {
		expect(decide({ rollRandom: () => true })).toEqual({ kind: "random" });
		expect(decide({ rollRandom: () => false })).toEqual({ kind: "none" });
	});

	it("never mentions or rolls outside the Home Server", () => {
		const rollRandom = vi.fn(() => true);

		expect(decide({ isHomeServer: false, botMentioned: true, rollRandom })).toEqual({ kind: "none" });
		expect(decide({ isHomeServer: false, rollRandom })).toEqual({ kind: "none" });
		expect(rollRandom).not.toHaveBeenCalled();
	});
});

describe("rollRandomReply", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const settings = { randomResponseChannelId: "chan", randomResponseChance: 50 };

	it("rolls once and hits for exactly the configured share of rolls", () => {
		const random = vi.spyOn(Math, "random");

		random.mockReturnValue(0.4999);
		expect(rollRandomReply(settings, "chan", ACTIVE)).toBe(true);
		random.mockReturnValue(0.5);
		expect(rollRandomReply(settings, "chan", ACTIVE)).toBe(false);
		expect(random).toHaveBeenCalledTimes(2);
	});

	it("always hits at 100 and never rolls at 0", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0.999999);

		expect(rollRandomReply({ ...settings, randomResponseChance: 100 }, "chan", ACTIVE)).toBe(true);
		expect(rollRandomReply({ ...settings, randomResponseChance: 0 }, "chan", ACTIVE)).toBe(false);
		expect(random).toHaveBeenCalledTimes(1);
	});

	it("never fires in a channel other than the configured one, and does not roll", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0);

		expect(rollRandomReply(settings, "elsewhere", ACTIVE)).toBe(false);
		expect(rollRandomReply(settings, "general", ACTIVE, { defaultChannelId: "general" })).toBe(false);
		expect(random).not.toHaveBeenCalled();
	});

	it("falls back to the default channel when none is configured", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0);
		const unset = { ...settings, randomResponseChannelId: null };

		expect(rollRandomReply(unset, "general", ACTIVE, { defaultChannelId: "general" })).toBe(true);
		expect(rollRandomReply(unset, "elsewhere", ACTIVE, { defaultChannelId: "general" })).toBe(false);
		expect(random).toHaveBeenCalledTimes(1);
	});

	it("uses the Guess Who Channel as the default channel", () => {
		vi.spyOn(Math, "random").mockReturnValue(0);

		expect(rollRandomReply({ ...settings, randomResponseChannelId: null }, GUESS_WHO_CHANNEL_ID, ACTIVE)).toBe(true);
	});

	it("lets a configured channel override the default", () => {
		vi.spyOn(Math, "random").mockReturnValue(0);

		expect(rollRandomReply(settings, "chan", ACTIVE, { defaultChannelId: "general" })).toBe(true);
	});

	it("is off at chance 0 even in the default channel, and does not roll", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0);

		expect(
			rollRandomReply({ randomResponseChannelId: null, randomResponseChance: 0 }, "general", ACTIVE, {
				defaultChannelId: "general",
			}),
		).toBe(false);
		expect(random).not.toHaveBeenCalled();
	});
});

describe("rollRandomReply gates", () => {
	const settings = { randomResponseChannelId: "chan", randomResponseChance: 100 };

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		["4 messages", { messages: 4, members: 3, sinceLastReply: 30 }, "quiet"],
		["5 messages from one member", { messages: 5, members: 1, sinceLastReply: 30 }, "quiet"],
		["29 messages since the last reply", { messages: 9, members: 3, sinceLastReply: 29 }, "spacing"],
	])("does not roll with %s, and says why", (_label, activity, reason) => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0);
		const onSkip = vi.fn();

		expect(rollRandomReply(settings, "chan", activity, { onSkip })).toBe(false);
		expect(onSkip).toHaveBeenCalledWith(reason);
		expect(random).not.toHaveBeenCalled();
	});

	it("rolls once an active, spaced channel is reached", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0);
		const onSkip = vi.fn();

		expect(rollRandomReply(settings, "chan", ACTIVE, { onSkip })).toBe(true);
		expect(random).toHaveBeenCalledTimes(1);
		expect(onSkip).not.toHaveBeenCalled();
	});

	it("reports no skip for chance 0 or another channel", () => {
		const onSkip = vi.fn();
		const quiet = { messages: 0, members: 0, sinceLastReply: 0 };

		expect(rollRandomReply({ ...settings, randomResponseChance: 0 }, "chan", quiet, { onSkip })).toBe(false);
		expect(rollRandomReply(settings, "elsewhere", quiet, { onSkip })).toBe(false);
		expect(onSkip).not.toHaveBeenCalled();
	});
});

describe("isBotMentioned", () => {
	it("ignores @everyone and @here", () => {
		const has = vi.fn(() => true);
		const message = { mentions: { has }, client: { user: { id: "bot" } } };

		expect(isBotMentioned(message as never)).toBe(true);
		expect(has).toHaveBeenCalledWith(message.client.user, { ignoreEveryone: true });
	});
});
