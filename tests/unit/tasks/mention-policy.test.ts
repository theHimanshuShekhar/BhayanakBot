import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	endGiveaway,
	getActiveExpiredGiveaways,
	getGiveawaysAwaitingAnnouncement,
} from "../../../src/db/queries/giveaways.js";
import { getPendingReminders, markReminderSent } from "../../../src/db/queries/reminders.js";
import { endGiveaways } from "../../../src/tasks/endGiveaways.js";
import { sendReminders } from "../../../src/tasks/sendReminders.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";
import { createGuild } from "../../helpers/giveawayMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	endGiveaway: vi.fn(),
	getActiveExpiredGiveaways: vi.fn(),
	getGiveawaysAwaitingAnnouncement: vi.fn(),
	markGiveawayAnnounced: vi.fn(),
	recordGiveawayAnnounceFailure: vi.fn(),
}));
vi.mock("../../../src/db/queries/reminders.js", () => ({
	getPendingReminders: vi.fn(),
	markReminderSent: vi.fn(),
	markReminderFailed: vi.fn(),
	scheduleReminderRetry: vi.fn(),
}));

function createChannel() {
	return { send: vi.fn(async () => null), messages: { fetch: vi.fn(async () => null) } };
}

describe("task Mention Policy", () => {
	const channel = createChannel();
	const guild = createGuild(["w1", "w2", "w3"]);

	beforeEach(() => {
		vi.clearAllMocks();
		channel.send.mockClear();
		guild.channel.send.mockClear();
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = {
			channels: { fetch: vi.fn(async () => channel) },
			guilds: { fetch: vi.fn(async () => guild) },
		} as unknown as typeof container.client;
	});

	it("reminder delivery notifies only the reminder owner", async () => {
		vi.mocked(getPendingReminders).mockResolvedValue([
			{ id: 1, userId: "owner-1", channelId: "c1", message: "@everyone ping", createdAt: new Date() },
		] as never);

		await sendReminders.run();

		const [sent] = channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		expect(sent.content).toBe("<@owner-1>");
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: ["owner-1"] });
		expect(markReminderSent).toHaveBeenCalledWith(1);
	});

	it("giveaway announcement notifies only the winners", async () => {
		vi.mocked(getGiveawaysAwaitingAnnouncement).mockResolvedValue([]);
		vi.mocked(getActiveExpiredGiveaways).mockResolvedValue([
			{
				id: 1,
				messageId: "m1",
				channelId: "c1",
				guildId: "g1",
				winnerCount: 2,
				prize: "@everyone Nitro",
				entries: ["w1", "w2", "w3"],
			},
		] as never);
		vi.mocked(endGiveaway).mockImplementation((async (_guildId: string, _messageId: string, winners: string[]) => ({
			id: 1,
			channelId: "c1",
			messageId: "m1",
			prize: "@everyone Nitro",
			winners,
		})) as never);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);

		try {
			await endGiveaways.run();
		} finally {
			randomSpy.mockRestore();
		}

		const [sent] = guild.channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		const winners = vi.mocked(endGiveaway).mock.calls[0]?.[2] as string[];
		expect(winners).toHaveLength(2);
		for (const winner of winners) expect(sent.content).toContain(`<@${winner}>`);
		expect(sent.content).toContain("@everyone Nitro");
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: winners });
	});
});
