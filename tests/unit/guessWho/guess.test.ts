import { describe, expect, it } from "vitest";
import { getGuessedUserId } from "../../../src/lib/guessWho/guess.js";

describe("getGuessedUserId", () => {
	it("reads an explicit mention typed in the message", () => {
		expect(getGuessedUserId("I think it was <@123456789012345678>")).toBe("123456789012345678");
		expect(getGuessedUserId("<@!123456789012345678> for sure")).toBe("123456789012345678");
	});

	it("uses the first mention when several are typed", () => {
		expect(getGuessedUserId("<@111> or <@222>")).toBe("111");
	});

	it("does not treat a reply without a typed mention as a guess", () => {
		expect(getGuessedUserId("lol no way")).toBeNull();
		expect(getGuessedUserId("")).toBeNull();
	});

	it("ignores role, channel and everyone mentions", () => {
		expect(getGuessedUserId("<@&123456789012345678> <#123456789012345678> @everyone")).toBeNull();
	});
});
