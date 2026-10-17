import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchResult } from "../../../src/db/queries/autoResponses.js";
import { decideReply, isBotMentioned, rollRandomReply } from "../../../src/lib/autoresponder/decideReply.js";

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
		expect(rollRandomReply(settings, "chan")).toBe(true);
		random.mockReturnValue(0.5);
		expect(rollRandomReply(settings, "chan")).toBe(false);
		expect(random).toHaveBeenCalledTimes(2);
	});

	it("always hits at 100 and never rolls at 0", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0.999999);

		expect(rollRandomReply({ ...settings, randomResponseChance: 100 }, "chan")).toBe(true);
		expect(rollRandomReply({ ...settings, randomResponseChance: 0 }, "chan")).toBe(false);
		expect(random).toHaveBeenCalledTimes(1);
	});

	it("never fires without a configured channel or in another channel, and does not roll", () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0);

		expect(rollRandomReply({ ...settings, randomResponseChannelId: null }, "chan")).toBe(false);
		expect(rollRandomReply(settings, "elsewhere")).toBe(false);
		expect(random).not.toHaveBeenCalled();
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
