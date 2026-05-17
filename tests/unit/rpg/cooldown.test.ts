import { describe, expect, it } from "vitest";
import { formatDuration } from "../../../src/lib/rpg/helpers/cooldown.js";

describe("formatDuration", () => {
	it("formats 0 ms as 0s", () => {
		expect(formatDuration(0)).toBe("0s");
	});

	it("formats 90 seconds as 1m 30s", () => {
		expect(formatDuration(90_000)).toBe("1m 30s");
	});

	it("formats 1 hour 1 minute 1 second", () => {
		expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
	});

	it("formats exactly 1 hour", () => {
		expect(formatDuration(3_600_000)).toBe("1h");
	});

	it("formats exactly 1 minute", () => {
		expect(formatDuration(60_000)).toBe("1m");
	});

	it("formats exactly 1 second", () => {
		expect(formatDuration(1_000)).toBe("1s");
	});

	it("formats complex duration", () => {
		expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
	});
});
