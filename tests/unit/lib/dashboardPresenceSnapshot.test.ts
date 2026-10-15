import { ChannelType, Collection } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeDashboardPresenceSnapshot } from "../../../src/db/queries/dashboardPresence.js";
import { TARGET_GUILD_ID } from "../../../src/lib/constants.js";
import { writeDashboardPresenceSnapshotForClient } from "../../../src/lib/dashboardPresence.js";

vi.mock("../../../src/db/queries/dashboardPresence.js", () => ({
	writeDashboardPresenceSnapshot: vi.fn(),
}));

const mockedWrite = vi.mocked(writeDashboardPresenceSnapshot);

function fakeMember(id: string, username: string, bot = false) {
	return {
		id,
		nickname: null,
		displayName: username,
		user: { id, username, globalName: null, bot, displayAvatarURL: () => `https://cdn/${id}.png` },
	};
}

function createGuild() {
	const members = new Collection<string, ReturnType<typeof fakeMember>>([["1001", fakeMember("1001", "desi")]]);
	const voiceStates = new Collection<string, { id: string; channelId: string | null }>([
		["1001", { id: "1001", channelId: "voice-1" }],
	]);
	const guild = {
		id: TARGET_GUILD_ID,
		name: "Bhayanak",
		memberCount: 2,
		iconURL: () => null,
		channels: {
			cache: new Collection([
				["voice-1", { id: "voice-1", name: "Chill", type: ChannelType.GuildVoice, rawPosition: 0, userLimit: 0 }],
			]),
		},
		voiceStates: { cache: voiceStates },
		members: { cache: members, fetch: vi.fn().mockResolvedValue(undefined) },
	};
	return { guild, members, voiceStates };
}

function clientFor(guild: ReturnType<typeof createGuild>["guild"]) {
	// A minimal stand-in for the discord.js client
	return { guilds: { cache: new Collection([[guild.id, guild]]) } } as unknown as Parameters<
		typeof writeDashboardPresenceSnapshotForClient
	>[0];
}

describe("writeDashboardPresenceSnapshotForClient member fetching", () => {
	beforeEach(() => {
		mockedWrite.mockReset();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ name: "Bhayanak", presence_count: 1, members: [{ username: "desi", status: "online" }] }),
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches the full member list once, then relies on the gateway member cache", async () => {
		const { guild } = createGuild();
		const client = clientFor(guild);

		await writeDashboardPresenceSnapshotForClient(client);
		await writeDashboardPresenceSnapshotForClient(client);
		await writeDashboardPresenceSnapshotForClient(client);

		expect(guild.members.fetch).toHaveBeenCalledTimes(1);
		expect(guild.members.fetch).toHaveBeenCalledWith();
		expect(mockedWrite).toHaveBeenCalledTimes(3);
		const payload = mockedWrite.mock.calls[2][0];
		expect(payload.channels[0].occupants.map((o) => o.userId)).toEqual(["1001"]);
		expect(payload.members).toEqual([expect.objectContaining({ name: "desi", isBot: false, channelId: "voice-1" })]);
	});

	it("fetches only voice-state members that are missing from the cache", async () => {
		const { guild, voiceStates, members } = createGuild();
		const client = clientFor(guild);
		await writeDashboardPresenceSnapshotForClient(client);
		guild.members.fetch.mockClear();

		voiceStates.set("2002", { id: "2002", channelId: "voice-1" });
		voiceStates.set("3003", { id: "3003", channelId: null });
		guild.members.fetch.mockImplementation(async () => {
			members.set("2002", fakeMember("2002", "music-bot", true));
		});
		await writeDashboardPresenceSnapshotForClient(client);

		expect(guild.members.fetch).toHaveBeenCalledTimes(1);
		expect(guild.members.fetch).toHaveBeenCalledWith({ user: ["2002"] });
		const occupants = mockedWrite.mock.calls[1][0].channels[0].occupants;
		expect(occupants.map((o) => [o.userId, o.isBot])).toEqual([
			["1001", false],
			["2002", true],
		]);
	});
});
