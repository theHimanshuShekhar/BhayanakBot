import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";
import { MAX_PROFILE_CHARS } from "../../../src/lib/personality/profileSize.js";
import { seedArchivedMessages } from "../../helpers/archive.js";

// Opt in with:
//   RUN_ZEN_E2E=1 ZEN_API_KEY=<key> ZEN_ALLOW_DISCORD_CONTENT=true \
//     pnpm vitest run tests/e2e/personality/zen-profile-generation.test.ts
// Makes real network calls to the Zen LLM Provider; skipped unless all three are set.
const runZenE2e =
	process.env.RUN_ZEN_E2E === "1" && !!process.env.ZEN_API_KEY && process.env.ZEN_ALLOW_DISCORD_CONTENT === "true";
const describeZenE2e = runZenE2e ? describe : describe.skip;

const GUILD_ID = "zen-guild";
const USER_ID = "zen-user";
const CHANNEL_ID = GUESS_WHO_CHANNEL_ID;
const START_DATE = new Date("2026-05-10T00:00:00.000Z");

async function cleanupRows(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	await db
		.delete(userPersonalityProfiles)
		.where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
}

function userMessage(index: number): string {
	return `User archive fixture ${index} discusses midnight strategy games, rainy cafe planning, and careful team encouragement without needing exact quotation.`;
}

function guildMessage(index: number): string {
	return `Guild archive fixture ${index} compares cozy puzzle nights, tactical banter, snack logistics, and supportive chaos across the server.`;
}

async function archiveUserMessages(count: number, offset = 0): Promise<string[]> {
	const messages = Array.from({ length: count }, (_, i) => {
		const index = offset + i;
		return {
			guildId: GUILD_ID,
			channelId: CHANNEL_ID,
			authorUserId: USER_ID,
			authorUsername: "ZenE2EUser",
			authorDisplayName: "Zen E2E User",
			messageId: `zen-u-${String(index).padStart(3, "0")}`,
			content: userMessage(index),
			messageCreatedAt: new Date(START_DATE.getTime() + index * 1000),
		};
	});
	await seedArchivedMessages(messages);
	return messages.map((message) => message.content);
}

async function archiveGuildMessages(count: number, offset = 0): Promise<string[]> {
	const messages = Array.from({ length: count }, (_, i) => {
		const index = offset + i;
		return {
			guildId: GUILD_ID,
			channelId: CHANNEL_ID,
			authorUserId: `zen-a-${String(index % 20).padStart(2, "0")}`,
			authorUsername: `ZenE2EAuthor${index % 20}`,
			authorDisplayName: `Zen E2E Author ${index % 20}`,
			messageId: `zen-g-${String(index).padStart(3, "0")}`,
			content: guildMessage(index),
			messageCreatedAt: new Date(START_DATE.getTime() + 200_000 + index * 1000),
		};
	});
	await seedArchivedMessages(messages);
	return messages.map((message) => message.content);
}

function seededIds(prefix: string, from: number, to: number): string[] {
	return Array.from({ length: to - from }, (_, i) => `${prefix}-${String(from + i).padStart(3, "0")}`);
}

async function getProfiles() {
	const [userProfile, guildProfile] = await Promise.all([
		db.query.userPersonalityProfiles.findFirst({
			where: and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)),
		}),
		db.query.guildPersonalityProfiles.findFirst({ where: eq(guildPersonalityProfiles.guildId, GUILD_ID) }),
	]);
	return { userProfile, guildProfile };
}

function expectGeneratedProfile(profile: string | null | undefined, sourceMessages: string[]): void {
	expect(profile).toBeTypeOf("string");
	const text = profile?.trim() ?? "";
	expect(text.length).toBeGreaterThan(40);
	expect(text.length).toBeLessThanOrEqual(MAX_PROFILE_CHARS);
	expect(text).not.toMatch(/Messages from (this person|this Discord server)|Build a detailed/i);
	for (const sourceMessage of sourceMessages) {
		expect(text).not.toContain(sourceMessage);
	}
}

describeZenE2e("real Zen personality profile generation", () => {
	beforeEach(async () => {
		await cleanupRows();
		container.logger = {
			debug: vi.fn(),
			warn: vi.fn(),
		} as unknown as typeof container.logger;
		container.client = {
			guilds: { cache: new Map() },
			users: { cache: new Map() },
		} as unknown as typeof container.client;
	});

	afterEach(async () => {
		await cleanupRows();
	});

	it("builds, then rewrites, user and guild profiles within the size cap through the real Zen provider", async () => {
		const userSourceMessages = await archiveUserMessages(100);
		const guildSourceMessages = await archiveGuildMessages(200);

		expect((await buildPersonalityProfile(USER_ID, GUILD_ID)).status).toBe("built");
		expect((await buildGuildPersonalityProfile(GUILD_ID)).status).toBe("built");
		const first = await getProfiles();
		expectGeneratedProfile(first.userProfile?.profile, userSourceMessages);
		expectGeneratedProfile(first.guildProfile?.profile, guildSourceMessages);
		const firstUserCursor = first.userProfile?.lastTrainingMessageId;
		const firstGuildCursor = first.guildProfile?.lastTrainingMessageId;
		// A build absorbs only what fits its budget (8,000 characters for a member), so the cursor may stop
		// short of the newest seeded message; it must still be one of the seeded messages.
		expect(seededIds("zen-u", 0, 100)).toContain(firstUserCursor);
		expect(seededIds("zen-g", 0, 200)).toContain(firstGuildCursor);

		// A refresh rewrites the profile in place: the new profile replaces the old one and stays within the cap.
		const moreUserMessages = await archiveUserMessages(20, 100);
		const moreGuildMessages = await archiveGuildMessages(40, 200);
		const pastCooldown = new Date(Date.now() - 60 * 60 * 1000);
		await db
			.update(userPersonalityProfiles)
			.set({ lastRefreshedAt: pastCooldown })
			.where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
		await db
			.update(guildPersonalityProfiles)
			.set({ lastRefreshedAt: pastCooldown })
			.where(eq(guildPersonalityProfiles.guildId, GUILD_ID));

		expect((await buildPersonalityProfile(USER_ID, GUILD_ID)).status).toBe("built");
		expect((await buildGuildPersonalityProfile(GUILD_ID)).status).toBe("built");
		const second = await getProfiles();
		expectGeneratedProfile(second.userProfile?.profile, [...userSourceMessages, ...moreUserMessages]);
		expectGeneratedProfile(second.guildProfile?.profile, [...guildSourceMessages, ...moreGuildMessages]);
		// The refresh moves each cursor strictly forward, to another seeded message. Ids are zero-padded, so they
		// compare in archive order.
		const secondUserCursor = second.userProfile?.lastTrainingMessageId ?? "";
		const secondGuildCursor = second.guildProfile?.lastTrainingMessageId ?? "";
		expect(seededIds("zen-u", 0, 120)).toContain(secondUserCursor);
		expect(seededIds("zen-g", 0, 240)).toContain(secondGuildCursor);
		expect(secondUserCursor > (firstUserCursor ?? "")).toBe(true);
		expect(secondGuildCursor > (firstGuildCursor ?? "")).toBe(true);
	}, 480_000);
});
