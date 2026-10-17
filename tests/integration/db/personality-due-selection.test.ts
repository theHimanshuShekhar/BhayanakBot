import { inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getGuildsDueForPersonalityBuild,
	getUsersDueForPersonalityBuild,
} from "../../../src/db/queries/personalityTraining.js";
import {
	archivedChannelMessages,
	guildPersonalityProfiles,
	guildSettings,
	userPersonalityProfiles,
} from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";
import { seedArchivedMessages } from "../../helpers/archive.js";

// The suite runs files in parallel against one database, so every assertion filters to this file's guilds.
const USER_GUILD = "due-user-guild";
const OFF_GUILD = "due-off-guild";
const NO_SETTINGS_GUILD = "due-nosettings";
const SERVER_INITIAL_GUILD = "due-server-initial";
const SERVER_REFRESH_GUILD = "due-server-refresh";
const SERVER_OFF_GUILD = "due-server-off";
const GUILDS = [USER_GUILD, OFF_GUILD, NO_SETTINGS_GUILD, SERVER_INITIAL_GUILD, SERVER_REFRESH_GUILD, SERVER_OFF_GUILD];
const START = new Date("2026-06-01T00:00:00.000Z");
const THRESHOLDS_USER = { initial: 100, refresh: 20 };
const THRESHOLDS_GUILD = { initial: 200, refresh: 40 };

async function seed(input: {
	guildId: string;
	prefix: string;
	count: number;
	authorFor: (index: number) => string;
	start?: Date;
	channelId?: string;
}): Promise<void> {
	const start = input.start ?? START;
	await seedArchivedMessages(
		Array.from({ length: input.count }, (_, index) => {
			const author = input.authorFor(index);
			return {
				guildId: input.guildId,
				channelId: input.channelId ?? GUESS_WHO_CHANNEL_ID,
				authorUserId: author,
				authorUsername: author,
				authorDisplayName: author,
				messageId: `${input.prefix}-${String(index).padStart(3, "0")}`,
				content: `Eligible archived message ${input.prefix} ${index} with enough context.`,
				messageCreatedAt: new Date(start.getTime() + index * 1000),
			};
		}),
	);
}

const oneAuthor = (userId: string) => () => userId;

async function dueUsers(): Promise<string[]> {
	const rows = await getUsersDueForPersonalityBuild(THRESHOLDS_USER);
	return rows
		.filter((row) => GUILDS.includes(row.guildId))
		.map((row) => `${row.guildId}/${row.userId}`)
		.sort();
}

async function dueGuilds(): Promise<string[]> {
	return (await getGuildsDueForPersonalityBuild(THRESHOLDS_GUILD)).filter((guildId) => GUILDS.includes(guildId)).sort();
}

describe("due personality profile selection", () => {
	beforeEach(async () => {
		await db.delete(archivedChannelMessages).where(inArray(archivedChannelMessages.guildId, GUILDS));
		await db.delete(userPersonalityProfiles).where(inArray(userPersonalityProfiles.guildId, GUILDS));
		await db.delete(guildPersonalityProfiles).where(inArray(guildPersonalityProfiles.guildId, GUILDS));
		await db.delete(guildSettings).where(inArray(guildSettings.guildId, GUILDS));
	});

	describe("members", () => {
		it("selects a member with 100 eligible messages and no profile, and not one with 99", async () => {
			await seed({ guildId: USER_GUILD, prefix: "u100", count: 100, authorFor: oneAuthor("u100") });
			await seed({ guildId: USER_GUILD, prefix: "u99", count: 99, authorFor: oneAuthor("u99") });

			expect(await dueUsers()).toEqual([`${USER_GUILD}/u100`]);
		});

		it("selects a member with a profile at 20 eligible messages after the cursor, and not at 19", async () => {
			// 45 messages; the cursor sits on message 24, leaving 20 after it. A second member's cursor leaves 19.
			await seed({ guildId: USER_GUILD, prefix: "r20", count: 45, authorFor: oneAuthor("r20") });
			await seed({ guildId: USER_GUILD, prefix: "r19", count: 45, authorFor: oneAuthor("r19") });
			await db.insert(userPersonalityProfiles).values([
				{
					userId: "r20",
					guildId: USER_GUILD,
					profile: "Profile.",
					lastTrainingMessageAt: new Date(START.getTime() + 24_000),
					lastTrainingMessageId: "r20-024",
				},
				{
					userId: "r19",
					guildId: USER_GUILD,
					profile: "Profile.",
					lastTrainingMessageAt: new Date(START.getTime() + 25_000),
					lastTrainingMessageId: "r19-025",
				},
			]);

			expect(await dueUsers()).toEqual([`${USER_GUILD}/r20`]);
		});

		it("applies the initial threshold to a row that only holds a cooldown stamp", async () => {
			await seed({ guildId: USER_GUILD, prefix: "s50", count: 50, authorFor: oneAuthor("s50") });
			await db
				.insert(userPersonalityProfiles)
				.values({ userId: "s50", guildId: USER_GUILD, lastRefreshedAt: new Date() });

			expect(await dueUsers()).toEqual([]);
		});

		it("does not count deleted messages or messages from other channels", async () => {
			await seed({ guildId: USER_GUILD, prefix: "d100", count: 100, authorFor: oneAuthor("d100") });
			await db
				.update(archivedChannelMessages)
				.set({ deletedAt: new Date() })
				.where(inArray(archivedChannelMessages.messageId, ["d100-000"]));
			await seed({
				guildId: USER_GUILD,
				prefix: "o100",
				count: 100,
				authorFor: oneAuthor("o100"),
				channelId: "due-other-channel",
			});

			expect(await dueUsers()).toEqual([]);
		});

		it("skips guilds with personality features off and includes guilds with no settings row", async () => {
			await seed({ guildId: OFF_GUILD, prefix: "off", count: 100, authorFor: oneAuthor("off-user") });
			await seed({ guildId: NO_SETTINGS_GUILD, prefix: "none", count: 100, authorFor: oneAuthor("none-user") });
			await db.insert(guildSettings).values({ guildId: OFF_GUILD, personalityEnabled: false });

			expect(await dueUsers()).toEqual([`${NO_SETTINGS_GUILD}/none-user`]);

			await db.insert(guildSettings).values({ guildId: NO_SETTINGS_GUILD, personalityEnabled: true });

			expect(await dueUsers()).toEqual([`${NO_SETTINGS_GUILD}/none-user`]);
		});

		it("counts a member per guild, not across guilds", async () => {
			await seed({ guildId: USER_GUILD, prefix: "x60", count: 60, authorFor: oneAuthor("shared") });
			await seed({ guildId: NO_SETTINGS_GUILD, prefix: "x50", count: 50, authorFor: oneAuthor("shared") });

			expect(await dueUsers()).toEqual([]);
		});
	});

	describe("servers", () => {
		const spread = (index: number) => `author-${index % 10}`;

		it("selects a server with 200 eligible messages and no profile, and not one with 199", async () => {
			await seed({ guildId: SERVER_INITIAL_GUILD, prefix: "g200", count: 200, authorFor: spread });
			await seed({ guildId: SERVER_REFRESH_GUILD, prefix: "g199", count: 199, authorFor: spread });

			expect(await dueGuilds()).toEqual([SERVER_INITIAL_GUILD]);
		});

		it("selects a server with a profile at 40 eligible messages after the cursor, and not at 39", async () => {
			await seed({ guildId: SERVER_REFRESH_GUILD, prefix: "gr40", count: 100, authorFor: spread });
			await seed({ guildId: SERVER_INITIAL_GUILD, prefix: "gr39", count: 100, authorFor: spread });
			await db.insert(guildPersonalityProfiles).values([
				{
					guildId: SERVER_REFRESH_GUILD,
					profile: "Profile.",
					lastTrainingMessageAt: new Date(START.getTime() + 59_000),
					lastTrainingMessageId: "gr40-059",
				},
				{
					guildId: SERVER_INITIAL_GUILD,
					profile: "Profile.",
					lastTrainingMessageAt: new Date(START.getTime() + 60_000),
					lastTrainingMessageId: "gr39-060",
				},
			]);

			expect(await dueGuilds()).toEqual([SERVER_REFRESH_GUILD]);
		});

		it("skips a server with personality features off", async () => {
			await seed({ guildId: SERVER_OFF_GUILD, prefix: "goff", count: 200, authorFor: spread });
			await seed({ guildId: SERVER_INITIAL_GUILD, prefix: "gon", count: 200, authorFor: spread });
			await db.insert(guildSettings).values({ guildId: SERVER_OFF_GUILD, personalityEnabled: false });

			expect(await dueGuilds()).toEqual([SERVER_INITIAL_GUILD]);
		});
	});
});
