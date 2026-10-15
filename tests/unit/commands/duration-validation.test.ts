import { beforeEach, describe, expect, it, vi } from "vitest";
import { PollCommand } from "../../../src/commands/fun/poll.js";
import { GiveawayCommand } from "../../../src/commands/giveaway/giveaway.js";
import { BanCommand } from "../../../src/commands/moderation/ban.js";
import { MuteCommand } from "../../../src/commands/moderation/mute.js";
import { RemindCommand } from "../../../src/commands/utility/remind.js";
import { createGiveaway } from "../../../src/db/queries/giveaways.js";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { createCase } from "../../../src/db/queries/modCases.js";
import { db } from "../../../src/lib/database.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/modCases.js", () => ({ createCase: vi.fn() }));
vi.mock("../../../src/db/queries/giveaways.js", () => ({
	createGiveaway: vi.fn(),
	endGiveaway: vi.fn(),
	getGiveawayByMessage: vi.fn(),
}));
vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));
vi.mock("../../../src/db/queries/reminders.js", () => ({ markReminderSent: vi.fn() }));
vi.mock("../../../src/lib/database.js", () => ({ db: { insert: vi.fn() } }));
vi.mock("../../../src/commands/moderation/warn.js", () => ({ logToChannel: vi.fn() }));

const DAY = 24 * 60 * 60 * 1000;

function options(values: Record<string, string | null>) {
	return {
		getString: (name: string) => values[name] ?? null,
		getInteger: () => null,
		getUser: () => ({ id: "target", tag: "target#0", send: vi.fn(async () => null) }),
	};
}

describe("duration validation happens before any side effect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	describe("/mute", () => {
		function setup(duration: string) {
			const addRole = vi.fn(async () => null);
			const editReply = vi.fn(async () => null);
			const target = { id: "target", roles: { highest: { position: 1 }, add: addRole }, user: { tag: "t#0" } };
			const interaction = {
				options: options({ duration }),
				deferReply: vi.fn(async () => null),
				editReply,
				guildId: "g1",
				user: { id: "mod" },
				member: { roles: { highest: { position: 10 } } },
				guild: {
					members: { fetch: vi.fn(async () => target), me: { roles: { highest: { position: 20 } } } },
					roles: { cache: new Map([["muted", { id: "muted" }]]) },
				},
			};
			vi.mocked(getOrCreateSettings).mockResolvedValue({ mutedRoleId: "muted" } as never);
			vi.mocked(createCase).mockResolvedValue({ caseNumber: 1 } as never);
			const command = new MuteCommand(createCommandContext("src/commands/moderation/mute.ts"), {});
			return { run: () => command.chatInputRun(interaction as never), addRole, editReply };
		}

		it.each([
			"10",
			"0m",
			"-5d",
			"366d",
			"99999999999999999999w",
		])("rejects %s without muting or writing a case", async (input) => {
			const { run, addRole, editReply } = setup(input);
			await run();
			expect(addRole).not.toHaveBeenCalled();
			expect(createCase).not.toHaveBeenCalled();
			expect(editReply).toHaveBeenCalledTimes(1);
		});

		it("stores a 1 year mute with its full duration", async () => {
			const { run, addRole } = setup("365d");
			await run();
			expect(addRole).toHaveBeenCalledTimes(1);
			expect(createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "mute", duration: 365 * DAY }));
		});
	});

	describe("/ban", () => {
		function setup(duration: string) {
			const ban = vi.fn(async () => null);
			const send = vi.fn(async () => null);
			const editReply = vi.fn(async () => null);
			const interaction = {
				options: { ...options({ duration }), getUser: () => ({ id: "target", tag: "t#0", send }) },
				deferReply: vi.fn(async () => null),
				editReply,
				guildId: "g1",
				user: { id: "mod" },
				member: { roles: { highest: { position: 10 } } },
				guild: {
					name: "Guild",
					members: { fetch: vi.fn(async () => null), ban, me: { roles: { highest: { position: 20 } } } },
				},
			};
			vi.mocked(createCase).mockResolvedValue({ caseNumber: 1 } as never);
			const command = new BanCommand(createCommandContext("src/commands/moderation/ban.ts"), {});
			return { run: () => command.chatInputRun(interaction as never), ban, send, editReply };
		}

		it.each([
			"7",
			"0d",
			"-1h",
			"366d",
			"99999999999999999999w",
		])("rejects %s without DM, ban, or case", async (input) => {
			const { run, ban, send, editReply } = setup(input);
			await run();
			expect(ban).not.toHaveBeenCalled();
			expect(send).not.toHaveBeenCalled();
			expect(createCase).not.toHaveBeenCalled();
			expect(editReply).toHaveBeenCalledTimes(1);
		});

		it("records a 1 year tempban with its full duration", async () => {
			const { run, ban } = setup("365d");
			await run();
			expect(ban).toHaveBeenCalledTimes(1);
			expect(createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "tempban", duration: 365 * DAY }));
		});
	});

	describe("/remind set", () => {
		function setup(time: string) {
			const reply = vi.fn(async () => null);
			const returning = vi.fn(async () => [{ id: 1 }]);
			vi.mocked(db.insert).mockReturnValue({ values: vi.fn(() => ({ returning })) } as never);
			const interaction = {
				options: options({ time, message: "hi" }),
				reply,
				user: { id: "u1" },
				channelId: "c1",
				guildId: "g1",
			};
			const command = new RemindCommand(createCommandContext("src/commands/utility/remind.ts"), {});
			return { run: () => command.runSet(interaction as never), reply };
		}

		it.each([
			"5",
			"0s",
			"-5d",
			"366d",
			"99999999999999999999w",
		])("rejects %s without inserting a row", async (input) => {
			const { run, reply } = setup(input);
			await run();
			expect(db.insert).not.toHaveBeenCalled();
			expect(reply).toHaveBeenCalledTimes(1);
		});

		it("accepts a compound duration", async () => {
			const { run } = setup("1h30m");
			await run();
			expect(db.insert).toHaveBeenCalledTimes(1);
		});
	});

	describe("/giveaway start", () => {
		function setup(duration: string) {
			const reply = vi.fn(async () => null);
			const send = vi.fn(async () => ({ id: "m1", url: "u" }));
			const interaction = {
				options: { ...options({ duration, prize: "Nitro" }), getInteger: () => null },
				reply,
				deferReply: vi.fn(async () => null),
				editReply: vi.fn(async () => null),
				channel: { send },
				channelId: "c1",
				guildId: "g1",
				user: { id: "host", tag: "host#0" },
			};
			const command = new GiveawayCommand(createCommandContext("src/commands/giveaway/giveaway.ts"), {});
			return { run: () => command.runStart(interaction as never), reply, send };
		}

		it.each([
			"1",
			"0h",
			"-1d",
			"31d",
			"99999999999999999999w",
		])("rejects %s without posting or writing a row", async (input) => {
			const { run, reply, send } = setup(input);
			await run();
			expect(send).not.toHaveBeenCalled();
			expect(createGiveaway).not.toHaveBeenCalled();
			expect(reply).toHaveBeenCalledTimes(1);
		});

		it("accepts exactly 30 days", async () => {
			const { run, send } = setup("30d");
			await run();
			expect(send).toHaveBeenCalledTimes(1);
			expect(createGiveaway).toHaveBeenCalledTimes(1);
		});
	});

	describe("/poll", () => {
		function setup(duration: string | null) {
			const reply = vi.fn(async () => null);
			const send = vi.fn(async () => ({ id: "m1" }));
			const values = vi.fn(async () => null);
			vi.mocked(db.insert).mockReturnValue({ values } as never);
			const interaction = {
				options: options({ question: "Q?", option1: "a", option2: "b", duration }),
				reply,
				deferReply: vi.fn(async () => null),
				deleteReply: vi.fn(async () => null),
				channel: { send },
				channelId: "c1",
				guildId: "g1",
			};
			const command = new PollCommand(createCommandContext("src/commands/fun/poll.ts"), {});
			return { run: () => command.chatInputRun(interaction as never), reply, send, values };
		}

		it.each([
			"30",
			"0m",
			"-5m",
			"31d",
			"99999999999999999999w",
		])("rejects %s without posting or writing a row", async (input) => {
			const { run, reply, send } = setup(input);
			await run();
			expect(send).not.toHaveBeenCalled();
			expect(db.insert).not.toHaveBeenCalled();
			expect(reply).toHaveBeenCalledTimes(1);
		});

		it("stores the expiry for a valid duration", async () => {
			const { run, values } = setup("2h");
			await run();
			expect(values).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: expect.any(Date) }));
		});

		it("omitting the duration means no expiry", async () => {
			const { run, values } = setup(null);
			await run();
			expect(values).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
		});
	});
});
