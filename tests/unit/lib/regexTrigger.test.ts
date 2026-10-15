import { container } from "@sapphire/framework";
import { RE2JS } from "re2js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	isRegexTriggerUsable,
	MAX_REGEX_INPUT_LENGTH,
	MAX_REGEX_PATTERN_LENGTH,
	matchRegexTrigger,
	regexTriggerTestHooks,
	validateRegexTrigger,
} from "../../../src/lib/autoresponder/regexTrigger.js";

function trigger(id: number, pattern: string) {
	return { id, guildId: "g1", trigger: pattern };
}

describe("regex autoresponse triggers", () => {
	beforeEach(() => {
		regexTriggerTestHooks.clearCache();
		container.logger = { warn: vi.fn() } as unknown as typeof container.logger;
	});

	it("returns promptly for a catastrophic pattern against a long non-matching message", () => {
		const start = performance.now();
		const result = matchRegexTrigger(trigger(1, "(a+)+$"), `${"a".repeat(1990)}!`);

		expect(result).toBeNull();
		expect(performance.now() - start).toBeLessThan(1000);
	});

	it("extracts named captures from a normal pattern, case-insensitively", () => {
		const result = matchRegexTrigger(trigger(2, "^my name is (?<name>.+)$"), "My Name Is Bob");

		expect(result).toEqual({ name: "Bob" });
	});

	it("omits named groups that did not participate in the match", () => {
		const result = matchRegexTrigger(trigger(3, "(?<a>x)|(?<b>y)"), "y");

		expect(result).toEqual({ b: "y" });
	});

	it("returns an empty capture set for a match without named groups", () => {
		expect(matchRegexTrigger(trigger(4, "hel+o"), "well hello")).toEqual({});
		expect(matchRegexTrigger(trigger(4, "hel+o"), "goodbye")).toBeNull();
	});

	it("only inspects the first MAX_REGEX_INPUT_LENGTH characters of a message", () => {
		const padded = `${"x".repeat(MAX_REGEX_INPUT_LENGTH)}needle`;

		expect(matchRegexTrigger(trigger(5, "needle"), padded)).toBeNull();
		expect(matchRegexTrigger(trigger(6, "needle"), `${"x".repeat(MAX_REGEX_INPUT_LENGTH - 6)}needle`)).toEqual({});
	});

	describe("validateRegexTrigger", () => {
		it("accepts RE2 syntax including named groups", () => {
			expect(validateRegexTrigger("^my name is (?<name>.+)$")).toEqual({ ok: true });
		});

		it.each([
			["lookahead", "foo(?=bar)"],
			["negative lookbehind", "(?<!a)b"],
			["backreference", "(a)\\1"],
			["unclosed bracket", "["],
		])("rejects %s", (_label, pattern) => {
			const result = validateRegexTrigger(pattern);

			expect(result.ok).toBe(false);
		});

		it("rejects patterns over the length cap", () => {
			const result = validateRegexTrigger("a".repeat(MAX_REGEX_PATTERN_LENGTH + 1));

			expect(result).toMatchObject({ ok: false });
			expect(validateRegexTrigger("a".repeat(MAX_REGEX_PATTERN_LENGTH))).toEqual({ ok: true });
		});
	});

	describe("stored incompatible patterns", () => {
		it("never match, and are logged once", () => {
			const stored = trigger(10, "foo(?=bar)");

			expect(matchRegexTrigger(stored, "foobar")).toBeNull();
			expect(matchRegexTrigger(stored, "foobar")).toBeNull();

			expect(container.logger.warn).toHaveBeenCalledTimes(1);
			expect(container.logger.warn).toHaveBeenCalledWith(expect.stringContaining("id=10"));
		});

		it("never match when over the length cap", () => {
			expect(matchRegexTrigger(trigger(11, "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1)), "a")).toBeNull();
			expect(isRegexTriggerUsable(trigger(11, "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1)))).toBe(false);
		});

		it("are reported as unusable, while valid patterns are usable", () => {
			expect(isRegexTriggerUsable(trigger(12, "(?=x)"))).toBe(false);
			expect(isRegexTriggerUsable(trigger(13, "x+"))).toBe(true);
		});
	});

	describe("compiled pattern cache", () => {
		it("compiles a response's pattern once across many messages", () => {
			const compile = vi.spyOn(RE2JS, "compile");
			const stored = trigger(20, "(?<w>\\w+)!");

			for (let i = 0; i < 5; i++) matchRegexTrigger(stored, `hey${i}!`);

			expect(compile).toHaveBeenCalledTimes(1);
			compile.mockRestore();
		});

		it("is bounded", () => {
			for (let i = 0; i < regexTriggerTestHooks.maxCacheEntries + 25; i++)
				matchRegexTrigger(trigger(1000 + i, "x"), "x");

			expect(regexTriggerTestHooks.cacheSize()).toBe(regexTriggerTestHooks.maxCacheEntries);
		});
	});
});
