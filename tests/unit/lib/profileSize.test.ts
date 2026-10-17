import { describe, expect, it } from "vitest";
import { fitProfileToCap, MAX_PROFILE_CHARS } from "../../../src/lib/personality/profileSize.js";

describe("fitProfileToCap", () => {
	it("returns text within the cap unchanged, trimmed", () => {
		expect(fitProfileToCap("  A short profile.  ")).toBe("A short profile.");
	});

	it("accepts text of exactly the cap", () => {
		const text = `${"a".repeat(MAX_PROFILE_CHARS - 1)}.`;
		expect(fitProfileToCap(text)).toBe(text);
	});

	it("returns null for empty or whitespace-only text", () => {
		expect(fitProfileToCap("")).toBeNull();
		expect(fitProfileToCap("   \n ")).toBeNull();
	});

	it("cuts after the last sentence that fits", () => {
		expect(fitProfileToCap("One two. Three four. Five six seven.", 22)).toBe("One two. Three four.");
	});

	it("never cuts mid-sentence, and counts ? and ! as sentence ends", () => {
		expect(fitProfileToCap("Really? Yes! Then it keeps going without stopping", 15)).toBe("Really? Yes!");
	});

	it("keeps a closing quote or bracket with its sentence", () => {
		expect(fitProfileToCap('They say "enough." And then more words follow', 20)).toBe('They say "enough."');
	});

	it("ignores dots that are not sentence ends", () => {
		expect(fitProfileToCap("Version 3.5 is loved. Everything else is ignored here", 24)).toBe("Version 3.5 is loved.");
	});

	it("returns null when no sentence ends within the cap", () => {
		expect(fitProfileToCap("one long breathless run-on that never stops. and so on", 20)).toBeNull();
	});
});
