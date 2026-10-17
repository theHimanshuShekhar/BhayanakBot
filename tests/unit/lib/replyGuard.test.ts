import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUTORESPONSE_TRIGGER_COOLDOWN_MS,
	AUTORESPONSE_USER_COOLDOWN_MS,
	beginAutoresponse,
	beginMention,
	beginRandom,
	MENTION_COOLDOWN_MS,
	RANDOM_REPLY_COOLDOWN_MS,
	replyGuardTestHooks,
} from "../../../src/lib/autoresponder/replyGuard.js";

function autoresponse(overrides: Partial<Parameters<typeof beginAutoresponse>[0]> = {}) {
	return beginAutoresponse({ guildId: "g", trigger: "hello", userId: "u", botMentioned: false, ...overrides });
}

describe("replyGuard cooldowns", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
		replyGuardTestHooks.reset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts a cooldown only when the reply was sent", () => {
		const failed = beginRandom("channel-1");
		if (failed.ok) failed.finish(false);
		const retry = beginRandom("channel-1");
		expect(retry.ok).toBe(true);
		if (retry.ok) retry.finish(true);

		expect(beginRandom("channel-1")).toEqual({ ok: false, reason: "random-cooldown" });
		vi.advanceTimersByTime(RANDOM_REPLY_COOLDOWN_MS + 1);
		expect(beginRandom("channel-1").ok).toBe(true);
	});

	it("refuses a second reply in the same key while the first is being written", () => {
		const first = beginMention("g", "u");
		expect(first.ok).toBe(true);

		expect(beginMention("g", "u")).toEqual({ ok: false, reason: "mention-in-flight" });
		expect(beginMention("g", "other").ok).toBe(true);

		if (first.ok) first.finish(false);
		expect(beginMention("g", "u").ok).toBe(true);
	});

	it("holds the mention cooldown per member for 10 seconds", () => {
		const gate = beginMention("g", "u");
		if (gate.ok) gate.finish(true);

		expect(beginMention("g", "u").ok).toBe(false);
		vi.advanceTimersByTime(MENTION_COOLDOWN_MS + 1);
		expect(beginMention("g", "u").ok).toBe(true);
	});

	it("holds autoresponse cooldowns of 10 minutes per trigger and 30 seconds per member", () => {
		const gate = autoresponse();
		if (gate.ok) gate.finish(true);

		expect(autoresponse({ userId: "other" })).toEqual({ ok: false, reason: "trigger-cooldown" });
		expect(autoresponse({ trigger: "bye" })).toEqual({ ok: false, reason: "user-cooldown" });

		vi.advanceTimersByTime(AUTORESPONSE_USER_COOLDOWN_MS + 1);
		expect(autoresponse({ trigger: "bye" }).ok).toBe(true);
		vi.advanceTimersByTime(AUTORESPONSE_TRIGGER_COOLDOWN_MS);
		expect(autoresponse({ userId: "other" }).ok).toBe(true);
	});

	it("lets a bot mention bypass the trigger cooldown, which then restarts", () => {
		const first = autoresponse();
		if (first.ok) first.finish(true);
		vi.advanceTimersByTime(AUTORESPONSE_USER_COOLDOWN_MS + 1);

		expect(autoresponse().ok).toBe(false);
		const mentioned = autoresponse({ botMentioned: true });
		expect(mentioned.ok).toBe(true);
		if (mentioned.ok) mentioned.finish(true);

		vi.advanceTimersByTime(AUTORESPONSE_TRIGGER_COOLDOWN_MS - AUTORESPONSE_USER_COOLDOWN_MS - 2);
		// Restarted by the mentioned reply: still on cooldown, though the first one would have expired.
		expect(autoresponse({ userId: "other" }).ok).toBe(false);
	});

	it("does not hold the trigger or member when only one of the two keys blocks", () => {
		const gate = autoresponse();
		if (gate.ok) gate.finish(true);
		const blocked = autoresponse({ trigger: "other-trigger" });
		expect(blocked.ok).toBe(false);

		vi.advanceTimersByTime(AUTORESPONSE_USER_COOLDOWN_MS + 1);
		expect(autoresponse({ trigger: "other-trigger" }).ok).toBe(true);
	});

	it("drops cooldown entries once the cooldown has passed", () => {
		for (let i = 0; i < 20; i++) {
			const gate = beginRandom(`channel-${i}`);
			if (gate.ok) gate.finish(true);
		}
		expect(replyGuardTestHooks.sizes().random).toBe(20);

		vi.advanceTimersByTime(RANDOM_REPLY_COOLDOWN_MS + 1);
		const gate = beginRandom("channel-new");
		if (gate.ok) gate.finish(true);

		expect(replyGuardTestHooks.sizes().random).toBe(1);
	});

	it("caps the number of cooldown entries", () => {
		for (let i = 0; i < 6_000; i++) {
			const gate = beginRandom(`channel-${i}`);
			if (gate.ok) gate.finish(true);
		}

		expect(replyGuardTestHooks.sizes().random).toBeLessThanOrEqual(5_000);
	});

	it("ignores a second finish", () => {
		const gate = beginRandom("channel-1");
		if (!gate.ok) throw new Error("expected a gate");
		gate.finish(false);
		const next = beginRandom("channel-1");
		gate.finish(true);

		expect(next.ok).toBe(true);
		if (next.ok) next.finish(false);
		expect(beginRandom("channel-1").ok).toBe(true);
	});
});
