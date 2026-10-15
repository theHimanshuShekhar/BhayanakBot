import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { logToChannel } from "../../../src/lib/moderation.js";

vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));
vi.mock("../../../src/db/queries/modCases.js", () => ({ createCase: vi.fn() }));

const logger = { warn: vi.fn(), error: vi.fn() };

function interactionWith(channel: Record<string, unknown> | undefined) {
	return {
		guildId: "g1",
		guild: { channels: { cache: new Map(channel ? [["log", channel]] : []) } },
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	container.logger = logger as unknown as typeof container.logger;
	vi.mocked(getOrCreateSettings).mockResolvedValue({ logChannelId: "log" } as never);
});

describe("logToChannel", () => {
	const embed = {} as never;

	it.each([
		["text", ChannelType.GuildText],
		["announcement", ChannelType.GuildAnnouncement],
	])("posts to a %s channel", async (_label, type) => {
		const send = vi.fn(async () => null);
		expect(await logToChannel(interactionWith({ type, send }), embed)).toBe(true);
		expect(send).toHaveBeenCalledOnce();
	});

	it.each([
		["category", ChannelType.GuildCategory],
		["voice", ChannelType.GuildVoice],
		["stage", ChannelType.GuildStageVoice],
		["forum", ChannelType.GuildForum],
		["thread", ChannelType.PublicThread],
	])("skips a %s channel without throwing and reports not posted", async (_label, type) => {
		// A category has no send(); calling it would throw. The type check must keep us from trying.
		const channel = { type };
		expect(await logToChannel(interactionWith(channel), embed)).toBe(false);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("does not post to a non-text channel that happens to have send()", async () => {
		const send = vi.fn(async () => null);
		expect(await logToChannel(interactionWith({ type: ChannelType.GuildVoice, send }), embed)).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it("reports not posted when the channel no longer exists", async () => {
		expect(await logToChannel(interactionWith(undefined), embed)).toBe(false);
	});

	it("reports success without posting when no log channel is configured", async () => {
		vi.mocked(getOrCreateSettings).mockResolvedValue({ logChannelId: null } as never);
		expect(await logToChannel(interactionWith(undefined), embed)).toBe(true);
	});

	it("reports not posted when sending fails", async () => {
		const send = vi.fn(async () => {
			throw new Error("Missing Permissions");
		});
		expect(await logToChannel(interactionWith({ type: ChannelType.GuildText, send }), embed)).toBe(false);
		expect(logger.warn).toHaveBeenCalled();
	});
});
