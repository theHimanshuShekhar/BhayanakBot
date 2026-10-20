import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { OUTAGE_THRESHOLD, recordLlmOutcome, resetAiOutage, settleOutageNotices } from "../../../src/lib/aiOutage.js";
import { TARGET_GUILD_ID } from "../../../src/lib/constants.js";
import type { ZenFailureReason } from "../../../src/lib/llmProvider.js";

vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));

const logger = { warn: vi.fn() };
const send = vi.fn(async (_options: unknown) => null);

function fail(reason: ZenFailureReason = "http_error", times = 1) {
	for (let i = 0; i < times; i++) recordLlmOutcome({ ok: false, reason });
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	resetAiOutage();
	const channel = { type: ChannelType.GuildText, send };
	const guild = { channels: { cache: new Map([["log", channel]]) } };
	container.logger = logger as unknown as typeof container.logger;
	(container as unknown as { client: unknown }).client = { guilds: { cache: new Map([[TARGET_GUILD_ID, guild]]) } };
	vi.mocked(getOrCreateSettings).mockResolvedValue({ logChannelId: "log" } as never);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("AI Outage alert", () => {
	it("posts nothing after 4 failures and one notice at the 5th", async () => {
		fail("http_error", OUTAGE_THRESHOLD - 1);
		await settleOutageNotices();
		expect(send).not.toHaveBeenCalled();

		fail("fetch_error");
		await settleOutageNotices();
		expect(getOrCreateSettings).toHaveBeenCalledWith(TARGET_GUILD_ID);
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith({
			content:
				"⚠️ AI replies are failing: 5 requests in a row (last: fetch_error). Members see no error; replies resume automatically.",
		});
	});

	it("never overrides allowedMentions, so the client default notifies nobody", async () => {
		fail("empty", 5);
		await settleOutageNotices();
		expect(Object.keys(send.mock.calls[0]?.[0] as object)).toEqual(["content"]);
	});

	it("posts nothing more while the outage lasts", async () => {
		fail("truncated", 20);
		await settleOutageNotices();
		expect(send).toHaveBeenCalledOnce();
	});

	it("posts one recovery notice with the outage duration and failure count", async () => {
		fail("http_error", 3);
		vi.advanceTimersByTime(12 * 60_000);
		fail("http_error", 4);
		await settleOutageNotices();
		send.mockClear();

		recordLlmOutcome({ ok: true });
		recordLlmOutcome({ ok: true });
		await settleOutageNotices();

		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith({ content: "✅ AI replies recovered after 12m (7 failed requests)." });
	});

	it("starts a fresh run, and can alert again, after recovery", async () => {
		fail("http_error", 5);
		recordLlmOutcome({ ok: true });
		await settleOutageNotices();
		send.mockClear();

		fail("http_error", 4);
		await settleOutageNotices();
		expect(send).not.toHaveBeenCalled();
		fail("http_error");
		await settleOutageNotices();
		expect(send).toHaveBeenCalledOnce();
	});

	it("says nothing on a success when no outage was announced", async () => {
		fail("http_error", 4);
		recordLlmOutcome({ ok: true });
		await settleOutageNotices();
		expect(send).not.toHaveBeenCalled();
	});

	it("resets the run on a success before the threshold", async () => {
		fail("http_error", 4);
		recordLlmOutcome({ ok: true });
		fail("http_error", 4);
		await settleOutageNotices();
		expect(send).not.toHaveBeenCalled();
	});

	it.each([
		"refusal",
		"content_filter",
		"not_configured",
		"privacy_disabled",
		"queue_full",
	] as const)("%s neither counts as a failure nor resets the run", async (reason) => {
		fail("http_error", 2);
		fail(reason, 10);
		fail("http_error", 2);
		await settleOutageNotices();
		expect(send).not.toHaveBeenCalled();

		fail("http_error");
		await settleOutageNotices();
		expect(send).toHaveBeenCalledOnce();
	});

	it("does not announce recovery on an excluded reason during an outage", async () => {
		fail("http_error", 5);
		await settleOutageNotices();
		send.mockClear();
		fail("refusal", 3);
		await settleOutageNotices();
		expect(send).not.toHaveBeenCalled();
	});

	describe("when the notice cannot be posted", () => {
		it("logs a warning when no log channel is configured", async () => {
			vi.mocked(getOrCreateSettings).mockResolvedValue({ logChannelId: null } as never);
			fail("http_error", 5);
			await settleOutageNotices();
			expect(send).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No log channel configured"));
		});

		it("logs a warning when the log channel cannot be found", async () => {
			vi.mocked(getOrCreateSettings).mockResolvedValue({ logChannelId: "gone" } as never);
			fail("http_error", 5);
			await settleOutageNotices();
			expect(send).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
		});

		it("logs a warning, without throwing, when sending fails", async () => {
			send.mockRejectedValueOnce(new Error("Missing Permissions"));
			expect(() => fail("http_error", 5)).not.toThrow();
			await settleOutageNotices();
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Could not post"), expect.any(Error));
		});
	});
});
