import { describe, expect, it } from "vitest";
import { buildPublicBotStatsSnapshotInput, getPublicStatsIntervalMs } from "../../../src/lib/publicStats.js";

describe("public stats helpers", () => {
	it("builds a snapshot input from the ready client and command counter", () => {
		const client = {
			guilds: { cache: { size: 7 } },
			ws: { ping: 123 },
		};

		const input = buildPublicBotStatsSnapshotInput(client, 99, new Date("2026-05-27T12:00:00.000Z"));

		expect(input).toEqual({
			guilds: 7,
			commandsRun: 99,
			latencyMs: 123,
			capturedAt: new Date("2026-05-27T12:00:00.000Z"),
		});
	});

	it("uses null latency when websocket ping is unavailable", () => {
		const client = { guilds: { cache: { size: 1 } }, ws: { ping: -1 } };

		expect(buildPublicBotStatsSnapshotInput(client, 5).latencyMs).toBeNull();
	});

	it("uses the default interval when PUBLIC_STATS_INTERVAL_MS is invalid", () => {
		const env = { PUBLIC_STATS_INTERVAL_MS: "nope" };

		expect(getPublicStatsIntervalMs(env)).toBe(5 * 60 * 1000);
	});

	it("uses PUBLIC_STATS_INTERVAL_MS when it is positive", () => {
		const env = { PUBLIC_STATS_INTERVAL_MS: "60000" };

		expect(getPublicStatsIntervalMs(env)).toBe(60_000);
	});
});
