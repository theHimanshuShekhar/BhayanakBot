import { describe, expect, it } from "vitest";
import {
	buildDashboardPresencePayload,
	getDashboardPresenceIntervalMs,
	matchGuildMember,
	type PresenceGuildMemberView,
	type PresenceGuildView,
	parseWidgetView,
} from "../../../src/lib/dashboardPresence.js";

function guildMember(overrides: Partial<PresenceGuildMemberView> = {}): PresenceGuildMemberView {
	return {
		userId: "1001",
		username: "desi",
		globalName: null,
		nickname: null,
		displayName: "Desi Spoderman",
		avatarUrl: "https://cdn.discordapp.com/avatars/1001/abc.png",
		isBot: false,
		voiceChannelId: null,
		mute: false,
		deaf: false,
		streaming: false,
		...overrides,
	};
}

function guildView(members: PresenceGuildMemberView[]): PresenceGuildView {
	return {
		id: "199168135935295488",
		name: "Bhayanak",
		iconUrl: null,
		memberCount: 120,
		voiceChannels: [
			{ id: "voice-1", name: "Discord And Chill", position: 0, userLimit: 0 },
			{ id: "voice-2", name: "Horny Jail", position: 4, userLimit: 2 },
		],
		members,
	};
}

describe("dashboard presence interval", () => {
	it("defaults to 60s when the env value is invalid", () => {
		expect(getDashboardPresenceIntervalMs({ DASHBOARD_PRESENCE_INTERVAL_MS: "nope" })).toBe(60_000);
	});

	it("uses DASHBOARD_PRESENCE_INTERVAL_MS when positive", () => {
		expect(getDashboardPresenceIntervalMs({ DASHBOARD_PRESENCE_INTERVAL_MS: "30000" })).toBe(30_000);
	});
});

describe("matchGuildMember", () => {
	const members = [
		guildMember({ userId: "1", username: "desi", displayName: "Desi Spoderman" }),
		guildMember({
			userId: "2",
			username: "patchbot",
			globalName: "PatchBot",
			displayName: "PatchBot",
			isBot: true,
		}),
		guildMember({ userId: "3", username: "lamp", nickname: "Lamp", displayName: "Lamp" }),
	];

	it("matches a widget display name to the guild member", () => {
		expect(matchGuildMember("Desi Spoderman", members)?.userId).toBe("1");
	});

	it("matches nicknames", () => {
		expect(matchGuildMember("Lamp", members)?.userId).toBe("3");
	});

	it("falls back to a case-insensitive match", () => {
		expect(matchGuildMember("desi spoderman", members)?.userId).toBe("1");
	});

	it("returns null when nothing matches", () => {
		expect(matchGuildMember("Nobody Here", members)).toBeNull();
	});

	it("returns null on ambiguity instead of guessing", () => {
		const dupes = [
			guildMember({ userId: "1", username: "mini zini", displayName: "mini zini" }),
			guildMember({ userId: "2", username: "Mini Zini", displayName: "Mini Zini" }),
		];
		expect(matchGuildMember("MINI ZINI", dupes)).toBeNull();
	});
});

describe("buildDashboardPresencePayload", () => {
	it("flags bots from the guild view and groups voice occupants", () => {
		const payload = buildDashboardPresencePayload(
			guildView([
				guildMember({ userId: "1", displayName: "Desi Spoderman", voiceChannelId: "voice-1" }),
				guildMember({
					userId: "2",
					username: "bhayanakbot",
					displayName: "BhayanakBot",
					isBot: true,
					voiceChannelId: "voice-1",
					mute: true,
				}),
			]),
			{
				name: "Bhayanak",
				presenceCount: 2,
				members: [
					{ name: "Desi Spoderman", avatarUrl: null, status: "online", channelId: "voice-1" },
					{ name: "BhayanakBot", avatarUrl: null, status: "online", channelId: "voice-1" },
				],
			},
			new Date("2026-09-10T00:00:00.000Z"),
		);

		expect(payload.guild.presenceCount).toBe(2);
		expect(payload.capturedAt).toBe("2026-09-10T00:00:00.000Z");
		expect(payload.channels[0].occupants.map((o) => o.name)).toEqual(["Desi Spoderman", "BhayanakBot"]);
		expect(payload.channels[0].occupants[1]).toMatchObject({ isBot: true, mute: true });
		expect(payload.channels[1].occupants).toEqual([]);
		expect(payload.members).toEqual([
			{
				name: "Desi Spoderman",
				avatarUrl: "https://cdn.discordapp.com/avatars/1001/abc.png",
				status: "online",
				isBot: false,
				channelId: "voice-1",
			},
			{
				name: "BhayanakBot",
				avatarUrl: "https://cdn.discordapp.com/avatars/1001/abc.png",
				status: "online",
				isBot: true,
				channelId: "voice-1",
			},
		]);
	});

	it("prefers live guild voice state over the widget channel id", () => {
		const payload = buildDashboardPresencePayload(
			guildView([guildMember({ userId: "1", displayName: "Desi Spoderman", voiceChannelId: "voice-2" })]),
			{
				name: "Bhayanak",
				presenceCount: 1,
				members: [{ name: "Desi Spoderman", avatarUrl: null, status: "idle", channelId: "voice-1" }],
			},
		);

		expect(payload.members[0].channelId).toBe("voice-2");
		expect(payload.members[0].status).toBe("idle");
	});

	it("fails open for widget entries with no guild match", () => {
		const payload = buildDashboardPresencePayload(guildView([]), {
			name: "Bhayanak",
			presenceCount: 1,
			members: [{ name: "Mystery", avatarUrl: "https://widget/avatar.png", status: "online", channelId: null }],
		});

		expect(payload.members[0]).toEqual({
			name: "Mystery",
			avatarUrl: "https://widget/avatar.png",
			status: "online",
			isBot: false,
			channelId: null,
		});
	});
});

describe("parseWidgetView", () => {
	it("parses members and tolerates missing fields", () => {
		expect(
			parseWidgetView({
				name: "Bhayanak",
				presence_count: 2,
				members: [
					{ username: "Desi Spoderman", status: "online", avatar_url: "https://x/y.png", channel_id: "v1" },
					{ username: "Lamp", status: "idle" },
					{ status: "online" },
					"not-an-object",
				],
			}),
		).toEqual({
			name: "Bhayanak",
			presenceCount: 2,
			members: [
				{ name: "Desi Spoderman", avatarUrl: "https://x/y.png", status: "online", channelId: "v1" },
				{ name: "Lamp", avatarUrl: null, status: "idle", channelId: null },
			],
		});
	});

	it("defaults an absent payload to empty", () => {
		expect(parseWidgetView(null)).toEqual({ name: null, presenceCount: 0, members: [] });
	});
});
