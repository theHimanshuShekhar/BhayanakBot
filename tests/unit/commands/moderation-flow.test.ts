import { container } from "@sapphire/framework";
import { SlashCommandBuilder } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BanCommand } from "../../../src/commands/moderation/ban.js";
import { buildHistoryLines, HistoryCommand } from "../../../src/commands/moderation/history.js";
import { KickCommand } from "../../../src/commands/moderation/kick.js";
import { MuteCommand } from "../../../src/commands/moderation/mute.js";
import { UnbanCommand } from "../../../src/commands/moderation/unban.js";
import { UnmuteCommand } from "../../../src/commands/moderation/unmute.js";
import { WarnCommand } from "../../../src/commands/moderation/warn.js";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { createCase, getUserCases } from "../../../src/db/queries/modCases.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/modCases.js", () => ({ createCase: vi.fn(), getUserCases: vi.fn() }));
vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));

const logger = { warn: vi.fn(), error: vi.fn() };
const ctx = (name: string) => createCommandContext(`src/commands/moderation/${name}.ts`);

/** Records the order of side effects so tests can assert "validate, DM, act, record, log". */
function makeWorld() {
	const calls: string[] = [];
	const step = (name: string, result: unknown = null) =>
		vi.fn(async () => {
			calls.push(name);
			return result;
		});
	const send = step("dm");
	const logSend = step("log");
	const editReply = vi.fn(async (_reply: unknown) => {
		calls.push("reply");
		return null;
	});
	return { calls, step, send, logSend, editReply };
}

function makeInteraction(
	world: ReturnType<typeof makeWorld>,
	values: Record<string, string | null>,
	guild: Record<string, unknown>,
	user: Record<string, unknown> = {},
) {
	return {
		options: {
			getString: (name: string) => values[name] ?? null,
			getUser: () => ({ id: "target", tag: "t#0", send: world.send, ...user }),
		},
		deferReply: vi.fn(async () => null),
		editReply: world.editReply,
		guildId: "g1",
		user: { id: "mod" },
		member: { roles: { highest: { position: 10 } } },
		guild: {
			name: "Guild",
			channels: { cache: new Map([["log", { send: world.logSend }]]) },
			...guild,
			members: { me: { roles: { highest: { position: 20 } } }, ...(guild.members as object) },
		},
	};
}

function lastReply(world: ReturnType<typeof makeWorld>): { content?: string; embeds?: unknown[] } | string {
	return world.editReply.mock.calls.at(-1)![0] as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	setupSapphireContainer();
	container.logger = logger as unknown as typeof container.logger;
	vi.mocked(getOrCreateSettings).mockResolvedValue({ logChannelId: "log", mutedRoleId: "muted" } as never);
	vi.mocked(createCase).mockResolvedValue({ caseNumber: 7 } as never);
});

describe("/ban failure points, in order", () => {
	function setup(member: Record<string, unknown> | null, values: Record<string, string | null> = {}) {
		const world = makeWorld();
		const ban = world.step("ban");
		const target = member && { id: "target", roles: { highest: { position: 1 } }, bannable: true, ...member };
		const interaction = makeInteraction(world, values, {
			members: { fetch: vi.fn(async () => target), ban },
		});
		vi.mocked(createCase).mockImplementation((async () => {
			world.calls.push("case");
			return { caseNumber: 7 };
		}) as never);
		const command = new BanCommand(ctx("ban"), {});
		return { world, ban, run: () => command.chatInputRun(interaction as never) };
	}

	it("validates, DMs, bans, records, logs, then answers", async () => {
		const { world, run } = setup({});
		await run();
		expect(world.calls).toEqual(["dm", "ban", "case", "log", "reply"]);
	});

	it.each([
		["target outranks the bot", { roles: { highest: { position: 20 } } }],
		["target outranks the moderator", { roles: { highest: { position: 10 } } }],
		["the bot cannot ban the member", { bannable: false }],
	])("sends no DM and takes no action when %s", async (_name, member) => {
		const { world, run } = setup(member);
		await run();
		expect(world.calls).toEqual(["reply"]);
		expect(createCase).not.toHaveBeenCalled();
	});

	it("still bans when the DM fails", async () => {
		const { world, ban, run } = setup({});
		world.send.mockRejectedValueOnce(new Error("DMs closed"));
		await run();
		expect(ban).toHaveBeenCalledTimes(1);
		expect(createCase).toHaveBeenCalledTimes(1);
	});

	it("records no case when the ban itself fails", async () => {
		const { world, ban, run } = setup({});
		ban.mockRejectedValueOnce(new Error("Missing Permissions"));
		await run();
		expect(createCase).not.toHaveBeenCalled();
		expect(lastReply(world)).toContain("permission");
	});

	it("tells the moderator when the case could not be recorded after a successful ban", async () => {
		const { world, ban, run } = setup({});
		vi.mocked(createCase).mockRejectedValueOnce(new Error("db down"));
		await run();
		expect(ban).toHaveBeenCalledTimes(1);
		expect(world.editReply).toHaveBeenCalledTimes(1);
		expect(lastReply(world)).toBe("✅ Banned <@target>, but the case was not recorded.");
		expect(logger.error).toHaveBeenCalled();
	});

	it("still answers with the case when the log entry cannot be posted", async () => {
		const { world, run } = setup({});
		world.logSend.mockRejectedValueOnce(new Error("Missing Access"));
		await run();
		const reply = lastReply(world) as { content: string; embeds: unknown[] };
		expect(reply.content).toContain("log entry could not be posted");
		expect(reply.embeds).toHaveLength(1);
	});

	it("still answers when settings cannot be read for the log", async () => {
		const { world, run } = setup({});
		vi.mocked(getOrCreateSettings).mockRejectedValueOnce(new Error("db down"));
		await run();
		const reply = lastReply(world) as { content: string; embeds: unknown[] };
		expect(reply.content).toContain("log entry could not be posted");
		expect(reply.embeds).toHaveLength(1);
	});

	it("bans a user who is not in the server without a hierarchy check", async () => {
		const { ban, run } = setup(null);
		await run();
		expect(ban).toHaveBeenCalledTimes(1);
	});
});

describe("/kick failure points, in order", () => {
	function setup(member: Record<string, unknown>) {
		const world = makeWorld();
		const kick = world.step("kick");
		const target = {
			id: "target",
			roles: { highest: { position: 1 } },
			kickable: true,
			user: { tag: "t#0" },
			send: world.send,
			kick,
			...member,
		};
		const interaction = makeInteraction(world, {}, { members: { fetch: vi.fn(async () => target) } });
		vi.mocked(createCase).mockImplementation((async () => {
			world.calls.push("case");
			return { caseNumber: 7 };
		}) as never);
		const command = new KickCommand(ctx("kick"), {});
		return { world, kick, run: () => command.chatInputRun(interaction as never) };
	}

	it("validates, DMs, kicks, records, logs, then answers", async () => {
		const { world, run } = setup({});
		await run();
		expect(world.calls).toEqual(["dm", "kick", "case", "log", "reply"]);
	});

	it.each([
		["target outranks the bot", { roles: { highest: { position: 20 } } }],
		["target outranks the moderator", { roles: { highest: { position: 10 } } }],
		["the bot cannot kick the member", { kickable: false }],
	])("sends no DM and takes no action when %s", async (_name, member) => {
		const { world, run } = setup(member);
		await run();
		expect(world.calls).toEqual(["reply"]);
	});

	it("tells the moderator when the case could not be recorded", async () => {
		const { world, run } = setup({});
		vi.mocked(createCase).mockRejectedValueOnce(new Error("db down"));
		await run();
		expect(lastReply(world)).toBe("✅ Kicked <@target>, but the case was not recorded.");
	});
});

describe("/mute failure points, in order", () => {
	function setup(member: Record<string, unknown> = {}, role: Record<string, unknown> = {}) {
		const world = makeWorld();
		const addRole = world.step("mute");
		const target = {
			id: "target",
			roles: { highest: { position: 1 }, add: addRole },
			manageable: true,
			user: { tag: "t#0" },
			...member,
		};
		const interaction = makeInteraction(
			world,
			{ duration: "10m" },
			{
				members: { fetch: vi.fn(async () => target) },
				roles: { cache: new Map([["muted", { id: "muted", editable: true, ...role }]]) },
			},
		);
		vi.mocked(createCase).mockImplementation((async () => {
			world.calls.push("case");
			return { caseNumber: 7 };
		}) as never);
		const command = new MuteCommand(ctx("mute"), {});
		return { world, run: () => command.chatInputRun(interaction as never) };
	}

	it("mutes, records, logs, then answers", async () => {
		const { world, run } = setup();
		await run();
		expect(world.calls).toEqual(["mute", "case", "log", "reply"]);
	});

	it.each([
		["target outranks the bot", { roles: { highest: { position: 20 }, add: vi.fn() } }, {}],
		["target outranks the moderator", { roles: { highest: { position: 10 }, add: vi.fn() } }, {}],
		["the bot cannot manage the member", { manageable: false }, {}],
		["the muted role is above the bot", {}, { editable: false }],
	])("takes no action when %s", async (_name, member, role) => {
		const { world, run } = setup(member, role);
		await run();
		expect(world.calls).toEqual(["reply"]);
	});

	it("tells the moderator when the case could not be recorded", async () => {
		const { world, run } = setup();
		vi.mocked(createCase).mockRejectedValueOnce(new Error("db down"));
		await run();
		expect(lastReply(world)).toContain("Muted <@target>, but the case was not recorded");
	});
});

describe("/unmute failure points", () => {
	function setup(member: Record<string, unknown> = {}, role: Record<string, unknown> = {}) {
		const world = makeWorld();
		const removeRole = world.step("unmute");
		const target = {
			id: "target",
			roles: { cache: new Map([["muted", {}]]), remove: removeRole },
			manageable: true,
			user: { tag: "t#0" },
			...member,
		};
		const interaction = makeInteraction(
			world,
			{},
			{
				members: { fetch: vi.fn(async () => target) },
				roles: { cache: new Map([["muted", { id: "muted", editable: true, ...role }]]) },
			},
		);
		const command = new UnmuteCommand(ctx("unmute"), {});
		return { world, run: () => command.chatInputRun(interaction as never) };
	}

	it("refuses when the bot cannot manage the member or the role, and removes nothing", async () => {
		for (const [member, role] of [
			[{ manageable: false }, {}],
			[{}, { editable: false }],
		]) {
			const { world, run } = setup(member, role);
			await run();
			expect(world.calls).toEqual(["reply"]);
		}
	});

	it("tells the moderator when the case could not be recorded", async () => {
		const { world, run } = setup();
		vi.mocked(createCase).mockRejectedValueOnce(new Error("db down"));
		await run();
		expect(world.calls).toEqual(["unmute", "reply"]);
		expect(lastReply(world)).toBe("✅ Unmuted <@target>, but the case was not recorded.");
	});
});

describe("/unban", () => {
	function setup() {
		const world = makeWorld();
		const unban = world.step("unban");
		const interaction = makeInteraction(
			world,
			{ "user-id": "123" },
			{ bans: { fetch: vi.fn(async () => ({ user: { tag: "t#0" } })) }, members: { unban } },
		);
		const command = new UnbanCommand(ctx("unban"), {});
		return { world, unban, run: () => command.chatInputRun(interaction as never) };
	}

	it("reports success when the unban succeeded but logging failed", async () => {
		const { world, run } = setup();
		world.logSend.mockRejectedValueOnce(new Error("Missing Access"));
		await run();
		const reply = lastReply(world) as { content: string; embeds: unknown[] };
		expect(reply.embeds).toHaveLength(1);
		expect(reply.content).toContain("log entry could not be posted");
		expect(world.editReply).toHaveBeenCalledTimes(1);
	});

	it("reports success when the unban succeeded but the case was not recorded", async () => {
		const { world, run } = setup();
		vi.mocked(createCase).mockRejectedValueOnce(new Error("db down"));
		await run();
		expect(lastReply(world)).toBe("✅ Unbanned <@123>, but the case was not recorded.");
	});
});

describe("/warn", () => {
	function setup() {
		const world = makeWorld();
		const interaction = makeInteraction(world, { reason: "no caps" }, {});
		const command = new WarnCommand(ctx("warn"), {});
		return { world, run: () => command.chatInputRun(interaction as never) };
	}

	it("answers plainly when the warning could not be recorded", async () => {
		const { world, run } = setup();
		vi.mocked(createCase).mockRejectedValueOnce(new Error("db down"));
		await run();
		expect(world.editReply).toHaveBeenCalledTimes(1);
		expect(lastReply(world)).toContain("could not be recorded");
		expect(world.logSend).not.toHaveBeenCalled();
	});

	it("answers with the case when the log entry cannot be posted", async () => {
		const { world, run } = setup();
		world.logSend.mockRejectedValueOnce(new Error("Missing Access"));
		await run();
		expect((lastReply(world) as { embeds: unknown[] }).embeds).toHaveLength(1);
	});
});

describe("reason options are limited to 512 characters", () => {
	it.each([
		[BanCommand, "ban"],
		[KickCommand, "kick"],
		[MuteCommand, "mute"],
		[UnbanCommand, "unban"],
		[UnmuteCommand, "unmute"],
		[WarnCommand, "warn"],
	] as const)("/%s", (CommandClass, name) => {
		const command = new CommandClass(ctx(name), {});
		let json: { options: { name: string; max_length?: number }[] } | undefined;
		command.registerApplicationCommands({
			registerChatInputCommand: (build: (b: SlashCommandBuilder) => SlashCommandBuilder) => {
				json = build(new SlashCommandBuilder()).toJSON() as never;
			},
		} as never);
		expect(json!.options.find((o) => o.name === "reason")?.max_length).toBe(512);
	});
});

describe("/history", () => {
	const makeCase = (n: number, reason: string | null) => ({
		caseNumber: n,
		type: "warn",
		reason,
		createdAt: new Date("2026-01-01T00:00:00Z"),
	});

	it("truncates long reasons and collapses newlines", () => {
		const [line] = buildHistoryLines([makeCase(1, `${"x".repeat(5000)}\n@everyone`)] as never);
		expect(line.length).toBeLessThan(250);
		expect(line).toContain("…");
		expect(line).not.toContain("\n");
	});

	it("keeps a full page of long-reason cases within the embed description limit", () => {
		const cases = Array.from({ length: 50 }, (_, i) => makeCase(1000000 + i, "y".repeat(2000)));
		const lines = buildHistoryLines(cases as never);
		expect(lines).toHaveLength(20);
		expect(lines.join("\n").length).toBeLessThanOrEqual(4096);
	});

	it("answers with an embed for a very long history without throwing", async () => {
		const world = makeWorld();
		const cases = Array.from({ length: 300 }, (_, i) => makeCase(300 - i, "z".repeat(512)));
		vi.mocked(getUserCases).mockResolvedValue(cases as never);
		const interaction = {
			options: { getUser: () => ({ id: "t", tag: "t#0", displayAvatarURL: () => "https://example.com/a.png" }) },
			deferReply: vi.fn(async () => null),
			editReply: world.editReply,
			guildId: "g1",
		};
		await new HistoryCommand(ctx("history"), {}).chatInputRun(interaction as never);
		const embed = (lastReply(world) as { embeds: { data: { description: string; footer: { text: string } } }[] })
			.embeds[0].data;
		expect(embed.description.length).toBeLessThanOrEqual(4096);
		expect(embed.footer.text).toBe("Showing 20 of 300 cases");
	});
});
