import { container } from "@sapphire/framework";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getPendingReminders,
	markReminderFailed,
	markReminderSent,
	scheduleReminderRetry,
} from "../../../src/db/queries/reminders.js";
import { REMINDER_RETRY_WINDOW_MS, reminderRetryDelayMs, sendReminders } from "../../../src/tasks/sendReminders.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";

vi.mock("../../../src/db/queries/reminders.js", () => ({
	getPendingReminders: vi.fn(),
	markReminderSent: vi.fn(),
	markReminderFailed: vi.fn(),
	scheduleReminderRetry: vi.fn(),
}));

const NOW = new Date("2026-10-15T12:00:00Z");
const MINUTE = 60_000;

function reminder(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		userId: "owner-1",
		channelId: "c1",
		guildId: "g1",
		message: "stretch",
		remindAt: new Date(NOW.getTime() - MINUTE),
		attempts: 0,
		createdAt: new Date(NOW.getTime() - 60 * MINUTE),
		...overrides,
	};
}

describe("sendReminders delivery", () => {
	const channel = { send: vi.fn(async (_options: unknown) => null) };
	const dm = { send: vi.fn(async (_options: unknown) => null) };
	const channelsFetch = vi.fn();
	const usersFetch = vi.fn();
	const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		channelsFetch.mockResolvedValue(channel);
		usersFetch.mockResolvedValue(dm);
		container.logger = logger as unknown as typeof container.logger;
		container.client = {
			channels: { fetch: channelsFetch },
			users: { fetch: usersFetch },
		} as unknown as typeof container.client;
		vi.mocked(getPendingReminders).mockResolvedValue([reminder()] as never);
	});

	afterEach(() => vi.useRealTimers());

	it("posts in the original channel, pinging only the owner, and does not DM", async () => {
		await sendReminders.run();

		const [sent] = channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		expect(sent.content).toBe("<@owner-1>");
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: ["owner-1"] });
		expect(dm.send).not.toHaveBeenCalled();
		expect(markReminderSent).toHaveBeenCalledWith(1);
	});

	it("DMs the owner when the channel was deleted", async () => {
		channelsFetch.mockRejectedValue(new Error("Unknown Channel"));

		await sendReminders.run();

		expect(usersFetch).toHaveBeenCalledWith("owner-1");
		const [sent] = dm.send.mock.calls[0] as unknown as [{ content: string; embeds: unknown[] }];
		expect(sent.embeds).toHaveLength(1);
		expect(markReminderSent).toHaveBeenCalledWith(1);
		expect(scheduleReminderRetry).not.toHaveBeenCalled();
	});

	it("DMs the owner when the channel fetch finds nothing", async () => {
		channelsFetch.mockResolvedValue(null);

		await sendReminders.run();

		expect(dm.send).toHaveBeenCalledTimes(1);
		expect(markReminderSent).toHaveBeenCalledWith(1);
	});

	it("DMs the owner when the channel cannot be posted to", async () => {
		channelsFetch.mockResolvedValue({ id: "c1" });

		await sendReminders.run();

		expect(dm.send).toHaveBeenCalledTimes(1);
		expect(markReminderSent).toHaveBeenCalledWith(1);
	});

	it("DMs the owner when posting in the channel is refused", async () => {
		channel.send.mockRejectedValueOnce(new Error("Missing Permissions"));

		await sendReminders.run();

		expect(dm.send).toHaveBeenCalledTimes(1);
		expect(markReminderSent).toHaveBeenCalledWith(1);
	});

	it("retries with backoff, without marking it sent or failed, when neither channel nor DM works", async () => {
		channelsFetch.mockRejectedValue(new Error("Unknown Channel"));
		dm.send.mockRejectedValueOnce(new Error("Cannot send messages to this user"));

		await sendReminders.run();

		expect(markReminderSent).not.toHaveBeenCalled();
		expect(markReminderFailed).not.toHaveBeenCalled();
		expect(scheduleReminderRetry).toHaveBeenCalledWith(1, 1, new Date(NOW.getTime() + MINUTE));
	});

	it("backs off further on every failed attempt", async () => {
		channelsFetch.mockRejectedValue(new Error("Unknown Channel"));
		usersFetch.mockRejectedValue(new Error("Unknown User"));
		vi.mocked(getPendingReminders).mockResolvedValue([reminder({ attempts: 2 })] as never);

		await sendReminders.run();

		expect(scheduleReminderRetry).toHaveBeenCalledWith(1, 3, new Date(NOW.getTime() + 4 * MINUTE));
	});

	it("marks the reminder failed and logs once it has been undeliverable for the whole retry window", async () => {
		channelsFetch.mockRejectedValue(new Error("Unknown Channel"));
		usersFetch.mockRejectedValue(new Error("Unknown User"));
		vi.mocked(getPendingReminders).mockResolvedValue([
			reminder({ attempts: 12, remindAt: new Date(NOW.getTime() - REMINDER_RETRY_WINDOW_MS) }),
		] as never);

		await sendReminders.run();

		expect(markReminderFailed).toHaveBeenCalledWith(1, 13);
		expect(scheduleReminderRetry).not.toHaveBeenCalled();
		expect(markReminderSent).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalled();
	});

	it("still delivers a late reminder if the last attempt after the retry window succeeds", async () => {
		vi.mocked(getPendingReminders).mockResolvedValue([
			reminder({ remindAt: new Date(NOW.getTime() - 2 * REMINDER_RETRY_WINDOW_MS) }),
		] as never);

		await sendReminders.run();

		expect(markReminderSent).toHaveBeenCalledWith(1);
		expect(markReminderFailed).not.toHaveBeenCalled();
	});

	it("keeps delivering the other reminders when one cannot be delivered", async () => {
		vi.mocked(getPendingReminders).mockResolvedValue([
			reminder({ id: 1, channelId: "gone" }),
			reminder({ id: 2, channelId: "c1" }),
		] as never);
		channelsFetch.mockImplementation(async (id: string) => {
			if (id === "gone") throw new Error("Unknown Channel");
			return channel;
		});
		usersFetch.mockRejectedValueOnce(new Error("Unknown User"));

		await sendReminders.run();

		expect(scheduleReminderRetry).toHaveBeenCalledWith(1, 1, expect.any(Date));
		expect(markReminderSent).toHaveBeenCalledWith(2);
	});
});

describe("reminderRetryDelayMs", () => {
	it("doubles from one minute and caps at one hour", () => {
		expect([1, 2, 3, 4].map(reminderRetryDelayMs)).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE, 8 * MINUTE]);
		expect(reminderRetryDelayMs(7)).toBe(60 * MINUTE);
		expect(reminderRetryDelayMs(50)).toBe(60 * MINUTE);
	});
});
