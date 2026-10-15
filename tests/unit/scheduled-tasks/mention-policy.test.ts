import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endGiveaway, getActiveExpiredGiveaways } from "../../../src/db/queries/giveaways.js";
import { getPendingReminders, markReminderSent } from "../../../src/db/queries/reminders.js";
import { EndGiveawaysTask } from "../../../src/scheduled-tasks/endGiveaways.js";
import { SendRemindersTask } from "../../../src/scheduled-tasks/sendReminders.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	endGiveaway: vi.fn(),
	getActiveExpiredGiveaways: vi.fn(),
}));
vi.mock("../../../src/db/queries/reminders.js", () => ({
	getPendingReminders: vi.fn(),
	markReminderSent: vi.fn(),
}));

function createChannel() {
	return { send: vi.fn(async () => null), messages: { fetch: vi.fn(async () => null) } };
}

function createTask<T>(TaskClass: new (...args: any[]) => T, name: string): T {
	return new TaskClass({ store: {} as any, path: `${name}.ts`, root: ".", name } as any, {});
}

describe("scheduled task Mention Policy", () => {
	const channel = createChannel();

	beforeEach(() => {
		vi.clearAllMocks();
		channel.send.mockClear();
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = { channels: { fetch: vi.fn(async () => channel) } } as unknown as typeof container.client;
	});

	it("reminder delivery notifies only the reminder owner", async () => {
		vi.mocked(getPendingReminders).mockResolvedValue([
			{ id: 1, userId: "owner-1", channelId: "c1", message: "@everyone ping", createdAt: new Date() },
		] as never);

		await createTask(SendRemindersTask, "sendReminders").run();

		const [sent] = channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		expect(sent.content).toBe("<@owner-1>");
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: ["owner-1"] });
		expect(markReminderSent).toHaveBeenCalledWith(1);
	});

	it("giveaway announcement notifies only the winners", async () => {
		vi.mocked(getActiveExpiredGiveaways).mockResolvedValue([
			{
				id: 1,
				messageId: "m1",
				channelId: "c1",
				winnerCount: 2,
				prize: "@everyone Nitro",
				entries: ["w1", "w2", "w3"],
			},
		] as never);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);

		try {
			await createTask(EndGiveawaysTask, "endGiveaways").run();
		} finally {
			randomSpy.mockRestore();
		}

		const [sent] = channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		const winners = vi.mocked(endGiveaway).mock.calls[0]?.[1] as string[];
		expect(winners).toHaveLength(2);
		for (const winner of winners) expect(sent.content).toContain(`<@${winner}>`);
		expect(sent.content).toContain("@everyone Nitro");
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: winners });
	});
});
