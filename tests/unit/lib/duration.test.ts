import { describe, expect, it } from "vitest";
import { DURATION_CAPS, parseDuration } from "../../../src/lib/duration.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function ok(input: string, cap = DURATION_CAPS.mute) {
	const result = parseDuration(input, cap);
	if (!result.ok) throw new Error(`expected ${input} to parse, got: ${result.error}`);
	return result.ms;
}

function error(input: string, cap = DURATION_CAPS.mute) {
	const result = parseDuration(input, cap);
	if (result.ok) throw new Error(`expected ${input} to be rejected, got ${result.ms}ms`);
	return result.error;
}

describe("parseDuration", () => {
	it.each([
		["30s", 30 * SECOND],
		["10m", 10 * MINUTE],
		["1h", HOUR],
		["2d", 2 * DAY],
		["1w", WEEK],
	])("accepts a single unit: %s", (input, expected) => {
		expect(ok(input)).toBe(expected);
	});

	it.each([
		["1h30m", HOUR + 30 * MINUTE],
		["2d12h", 2 * DAY + 12 * HOUR],
		["1w2d3h4m5s", WEEK + 2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND],
	])("accepts compound durations: %s", (input, expected) => {
		expect(ok(input)).toBe(expected);
	});

	it("is case-insensitive and ignores surrounding whitespace", () => {
		expect(ok("  1H30M ")).toBe(HOUR + 30 * MINUTE);
		expect(ok("2D")).toBe(2 * DAY);
	});

	it("rejects bare numbers with a hint to add a unit", () => {
		expect(error("7")).toMatch(/add a unit, e\.g\. `10m`/i);
		expect(error("0")).toMatch(/add a unit/i);
	});

	it.each(["-5d", "-1", "+5m", "1.5h", "0.5d"])("rejects signs and decimals: %s", (input) => {
		expect(error(input)).toMatch(/invalid duration/i);
	});

	it.each(["0m", "0s", "0h0m"])("rejects zero: %s", (input) => {
		expect(error(input)).toMatch(/greater than zero/i);
	});

	it.each([
		"",
		"   ",
		"abc",
		"m",
		"h30",
		"1h 30m",
		"1x",
		"10min",
		"1h-30m",
		"1h30",
		"ten minutes",
	])("rejects malformed input: %j", (input) => {
		expect(error(input)).toMatch(/invalid duration|add a unit/i);
	});

	it("accepts a value exactly at the cap and rejects one second over it", () => {
		expect(ok("365d", DURATION_CAPS.mute)).toBe(365 * DAY);
		expect(error("365d1s", DURATION_CAPS.mute)).toMatch(/at most 1 year/);
		expect(ok("30d", DURATION_CAPS.giveaway)).toBe(30 * DAY);
		expect(error("31d", DURATION_CAPS.giveaway)).toMatch(/at most 30 days/);
	});

	it("applies the per-command caps", () => {
		expect(DURATION_CAPS.mute.ms).toBe(365 * DAY);
		expect(DURATION_CAPS.tempban.ms).toBe(365 * DAY);
		expect(DURATION_CAPS.reminder.ms).toBe(365 * DAY);
		expect(DURATION_CAPS.giveaway.ms).toBe(30 * DAY);
		expect(DURATION_CAPS.poll.ms).toBe(30 * DAY);
		expect(ok("2w", DURATION_CAPS.poll)).toBe(2 * WEEK);
		expect(error("5w", DURATION_CAPS.poll)).toMatch(/at most 30 days/);
	});

	it.each([
		"99999999999999999999999w",
		"9007199254740993s",
		`${"9".repeat(400)}d`,
		"99999999999w99999999999w",
	])("rejects huge or overflowing values as over the cap: %s", (input) => {
		expect(error(input)).toMatch(/at most 1 year/);
	});
});
