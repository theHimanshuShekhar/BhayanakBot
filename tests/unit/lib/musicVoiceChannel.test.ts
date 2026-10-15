import { PermissionFlagsBits } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getVoiceChannelRefusal, getYouTubeVideoId } from "../../../src/lib/music/voiceChannel.js";
import { createPreconditionContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

function makeGuild(botChannelId: string | null) {
	return { members: { me: { voice: { channelId: botChannelId } } } } as any;
}

function makeMember(channelId: string | null, admin = false) {
	return {
		voice: { channelId },
		permissions: { has: (flag: bigint) => admin && flag === PermissionFlagsBits.Administrator },
	} as any;
}

describe("getVoiceChannelRefusal", () => {
	it("allows anyone while the bot is not in a voice channel", () => {
		expect(getVoiceChannelRefusal(makeGuild(null), makeMember(null))).toBeNull();
		expect(getVoiceChannelRefusal(makeGuild(null), makeMember("vc-2"))).toBeNull();
	});

	it("allows a member in the bot's channel", () => {
		expect(getVoiceChannelRefusal(makeGuild("vc-1"), makeMember("vc-1"))).toBeNull();
	});

	it("refuses a member in a different channel, naming the bot's channel", () => {
		expect(getVoiceChannelRefusal(makeGuild("vc-1"), makeMember("vc-2"))).toContain("<#vc-1>");
	});

	it("refuses a member who is not in voice", () => {
		expect(getVoiceChannelRefusal(makeGuild("vc-1"), makeMember(null))).toContain("<#vc-1>");
	});

	it("exempts administrators from anywhere", () => {
		expect(getVoiceChannelRefusal(makeGuild("vc-1"), makeMember("vc-2", true))).toBeNull();
		expect(getVoiceChannelRefusal(makeGuild("vc-1"), makeMember(null, true))).toBeNull();
	});
});

describe("InBotVoiceChannel precondition", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	async function run(guild: any, member: any) {
		const { InBotVoiceChannelPrecondition } = await import("../../../src/preconditions/InBotVoiceChannel.js");
		const instance = new InBotVoiceChannelPrecondition(
			createPreconditionContext("src/preconditions/InBotVoiceChannel.ts"),
			{},
		);
		guild.members.fetch = vi.fn().mockResolvedValue(member);
		return instance.chatInputRun({ guild, user: { id: "u1" } } as any);
	}

	it("denies a member outside the bot's channel with the refusal message", async () => {
		const result = await run(makeGuild("vc-1"), makeMember("vc-2"));
		expect(result.isErr()).toBe(true);
		expect(result.unwrapErr().message).toContain("<#vc-1>");
	});

	it("allows a member in the bot's channel", async () => {
		const result = await run(makeGuild("vc-1"), makeMember("vc-1"));
		expect(result.isOk()).toBe(true);
	});
});

describe("music buttons", () => {
	async function press(customId: string, guild: any, member: any, queue: any) {
		vi.resetModules();
		vi.doMock("discord-player", async (orig) => ({
			...(await orig<typeof import("discord-player")>()),
			useQueue: () => queue,
		}));
		vi.doMock("../../../src/lib/music/guildSettingsCache.js", () => ({
			getGuildSettingsCached: async () => ({ djRoleId: "dj" }),
		}));
		const { MusicButtonsHandler } = await import("../../../src/interaction-handlers/musicButtons.js");
		const handler = new MusicButtonsHandler(
			{ store: {}, path: "/x/musicButtons.ts", root: "/x", name: "musicButtons" } as any,
			{},
		);
		const interaction = {
			customId,
			guild,
			guildId: "g1",
			member,
			reply: vi.fn(),
			update: vi.fn(),
			deferUpdate: vi.fn(),
		};
		await handler.run(interaction as any);
		return interaction;
	}

	function djMember(channelId: string | null, admin = false) {
		const member = makeMember(channelId, admin);
		const has = member.permissions.has;
		member.permissions.has = (flag: bigint) => has(flag) || flag === PermissionFlagsBits.ManageChannels;
		member.roles = { cache: new Map() };
		return member;
	}

	function fakeQueue() {
		return {
			node: { isPaused: () => false, pause: vi.fn(), skip: vi.fn() },
			currentTrack: null,
			delete: vi.fn(),
		};
	}

	it("refuses a DJ in another channel ephemerally without touching the player or its message", async () => {
		const queue = fakeQueue();
		const interaction = await press("music:skip", makeGuild("vc-1"), djMember("vc-2"), queue);
		expect(interaction.reply).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining("<#vc-1>"), flags: expect.anything() }),
		);
		expect(interaction.update).not.toHaveBeenCalled();
		expect(interaction.deferUpdate).not.toHaveBeenCalled();
		expect(queue.node.skip).not.toHaveBeenCalled();
	});

	it("lets a DJ in the bot's channel skip", async () => {
		const queue = fakeQueue();
		await press("music:skip", makeGuild("vc-1"), djMember("vc-1"), queue);
		expect(queue.node.skip).toHaveBeenCalled();
	});

	it("lets an administrator skip from anywhere", async () => {
		const queue = fakeQueue();
		await press("music:skip", makeGuild("vc-1"), djMember(null, true), queue);
		expect(queue.node.skip).toHaveBeenCalled();
	});
});

describe("getYouTubeVideoId", () => {
	it("reads the video from watch and short links", () => {
		expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
		expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=5")).toBe("dQw4w9WgXcQ");
		expect(getYouTubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
	});

	it("returns the linked video when the URL carries a playlist parameter", () => {
		expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmnop&index=3")).toBe(
			"dQw4w9WgXcQ",
		);
		expect(getYouTubeVideoId("https://www.youtube.com/watch?list=PLabcdefghijklmnop&v=dQw4w9WgXcQ")).toBe(
			"dQw4w9WgXcQ",
		);
		expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?list=PLabcdefghijklmnop")).toBe("dQw4w9WgXcQ");
	});

	it("is null for playlist pages, search text, and other sites", () => {
		expect(getYouTubeVideoId("https://www.youtube.com/playlist?list=PLabcdefghijklmnop")).toBeNull();
		expect(getYouTubeVideoId("never gonna give you up")).toBeNull();
		expect(getYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
	});
});
