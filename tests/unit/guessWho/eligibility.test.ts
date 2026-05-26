import { describe, expect, it } from "vitest";
import { isGameEligibleContent } from "../../../src/lib/guessWho/eligibility.js";

describe("isGameEligibleContent", () => {
	const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

	it("accepts normal conversational messages", () => {
		expect(
			isGameEligibleContent({
				content: "This is exactly the kind of message people would recognize.",
				messageCreatedAt: oldDate,
			}),
		).toBe(true);
	});

	it("rejects short, command-like, link-only, mass-mention, long, and too-recent messages", () => {
		expect(isGameEligibleContent({ content: "lol", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "/play never gonna give you up", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "!rank", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "https://example.com/thing", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "hello @everyone this is chaos", messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "a".repeat(301), messageCreatedAt: oldDate })).toBe(false);
		expect(isGameEligibleContent({ content: "This is too recent to be fair.", messageCreatedAt: new Date() })).toBe(
			false,
		);
	});
});
