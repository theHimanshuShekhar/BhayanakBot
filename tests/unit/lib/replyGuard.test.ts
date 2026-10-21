import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUTORESPONSE_TRIGGER_COOLDOWN_MS,
	AUTORESPONSE_USER_COOLDOWN_MS,
	beginAutoresponse,
	beginMention,
	beginRandom,
	MENTION_COOLDOWN_MS,
	RANDOM_REPLY_ACTIVITY_WINDOW_MS,
	RANDOM_REPLY_COOLDOWN_MS,
	RANDOM_REPLY_MIN_MESSAGES,
	RANDOM_REPLY_MIN_SPACING,
	randomReplySkipReason,
	recordChannelMessage,
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

describe("Random Reply channel activity", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
		replyGuardTestHooks.reset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function chat(channelId: string, authors: string[]) {
		let last = recordChannelMessage(channelId, "first");
		for (const author of authors) last = recordChannelMessage(channelId, author);
		return last;
	}

	it("is quiet below 5 messages or with fewer than 2 members", () => {
		expect(randomReplySkipReason(chat("c", ["b", "a", "b"]))).toBe("quiet");
		expect(randomReplySkipReason(recordChannelMessage("c", "b"))).toBeNull();

		replyGuardTestHooks.reset();
		let last = recordChannelMessage("solo", "a");
		for (let i = 1; i < RANDOM_REPLY_MIN_MESSAGES + 3; i++) last = recordChannelMessage("solo", "a");
		expect(last).toMatchObject({ messages: RANDOM_REPLY_MIN_MESSAGES + 3, members: 1 });
		expect(randomReplySkipReason(last)).toBe("quiet");
	});

	it("drops messages older than the window", () => {
		chat("c", ["b", "a", "b"]);
		vi.advanceTimersByTime(RANDOM_REPLY_ACTIVITY_WINDOW_MS - 1);
		expect(recordChannelMessage("c", "a")).toMatchObject({ messages: 5, members: 3 });

		vi.advanceTimersByTime(2);
		const later = recordChannelMessage("c", "a");
		expect(later).toMatchObject({ messages: 2, members: 1 });
		expect(randomReplySkipReason(later)).toBe("quiet");
	});

	it("counts each channel on its own", () => {
		chat("c", ["b", "a"]);
		expect(recordChannelMessage("other", "a")).toMatchObject({ messages: 1, members: 1 });
	});

	it("passes spacing with no previous reply, then blocks until 30 messages follow a sent reply", () => {
		expect(recordChannelMessage("c", "a").sinceLastReply).toBe(RANDOM_REPLY_MIN_SPACING);

		const gate = beginRandom("c");
		if (gate.ok) gate.finish(true);

		let last = recordChannelMessage("c", "a");
		for (let i = 1; i < RANDOM_REPLY_MIN_SPACING - 1; i++) last = recordChannelMessage("c", "b");
		expect(last.sinceLastReply).toBe(RANDOM_REPLY_MIN_SPACING - 1);
		expect(randomReplySkipReason(last)).toBe("spacing");
		expect(randomReplySkipReason(recordChannelMessage("c", "a"))).toBeNull();
	});

	it("restarts the spacing count only for a sent reply", () => {
		recordChannelMessage("c", "a");
		const sent = beginRandom("c");
		if (sent.ok) sent.finish(true);
		for (let i = 0; i < 10; i++) recordChannelMessage("c", "b");
		vi.advanceTimersByTime(RANDOM_REPLY_COOLDOWN_MS + 1);

		const failed = beginRandom("c");
		expect(failed.ok).toBe(true);
		if (failed.ok) failed.finish(false);
		expect(recordChannelMessage("c", "a").sinceLastReply).toBe(11);
	});

	it("forgets everything on reset, as a restart does", () => {
		recordChannelMessage("c", "a");
		const gate = beginRandom("c");
		if (gate.ok) gate.finish(true);

		replyGuardTestHooks.reset();

		expect(recordChannelMessage("c", "a")).toEqual({
			messages: 1,
			members: 1,
			sinceLastReply: RANDOM_REPLY_MIN_SPACING,
		});
	});

	it("keeps memory bounded by age, per-channel entries, and channels", () => {
		for (let i = 0; i < 500; i++) recordChannelMessage("busy", `u${i}`);
		expect(replyGuardTestHooks.sizes().entries).toBeLessThanOrEqual(200);

		vi.advanceTimersByTime(RANDOM_REPLY_ACTIVITY_WINDOW_MS + 1);
		recordChannelMessage("busy", "u");
		expect(replyGuardTestHooks.sizes().entries).toBe(1);

		for (let i = 0; i < 100; i++) recordChannelMessage(`channel-${i}`, "u");
		expect(replyGuardTestHooks.sizes().channels).toBeLessThanOrEqual(20);
	});
});
