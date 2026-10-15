import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	beginRandomReply,
	claimAiReply,
	markModerated,
	RANDOM_REPLY_COOLDOWN_MS,
	replyGuardTestHooks,
} from "../../../src/lib/autoresponder/replyGuard.js";

describe("replyGuard bounded state", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
		replyGuardTestHooks.reset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("caps the number of message claims", () => {
		for (let i = 0; i < 6_000; i++) claimAiReply(`message-${i}`);

		expect(replyGuardTestHooks.sizes().claims).toBeLessThanOrEqual(5_000);
	});

	it("drops claims once their hold time has passed", () => {
		for (let i = 0; i < 50; i++) claimAiReply(`old-${i}`);
		vi.advanceTimersByTime(6 * 60 * 1000);

		claimAiReply("fresh");

		expect(replyGuardTestHooks.sizes().claims).toBe(1);
		expect(claimAiReply("old-0")).toBe(true);
	});

	it("drops channel cooldown entries once the cooldown has passed", () => {
		for (let i = 0; i < 20; i++) beginRandomReply(`m-${i}`, `channel-${i}`)?.finish(true);
		expect(replyGuardTestHooks.sizes().randomLastSent).toBe(20);

		vi.advanceTimersByTime(RANDOM_REPLY_COOLDOWN_MS + 1);
		beginRandomReply("m-new", "channel-new")?.finish(true);

		expect(replyGuardTestHooks.sizes().randomLastSent).toBe(1);
	});

	it("refuses every AI reply to a moderated message and cancels a random one in flight", () => {
		const ticket = beginRandomReply("moderated-1", "channel-1");
		expect(ticket?.stillOwned()).toBe(true);

		markModerated("moderated-1");

		expect(ticket?.stillOwned()).toBe(false);
		expect(claimAiReply("moderated-1")).toBe(false);
		expect(beginRandomReply("moderated-1", "channel-2")).toBeNull();
		ticket?.finish(false);
	});
});
