import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";

// Opt in with:
//   RUN_ZEN_E2E=1 ZEN_API_KEY=<key> ZEN_ALLOW_DISCORD_CONTENT=true \
//     pnpm vitest run tests/e2e/personality/zen-profile-generation.test.ts
// Makes real network calls to the Zen LLM Provider; skipped unless all three are set.
const runZenE2e =
	process.env.RUN_ZEN_E2E === "1" && !!process.env.ZEN_API_KEY && process.env.ZEN_ALLOW_DISCORD_CONTENT === "true";
const describeZenE2e = runZenE2e ? describe : describe.skip;

// Profile generation is switched off by default; the real LLM path under test needs it on.
const featureFlags = vi.hoisted(() => ({ personalityGeneration: true }));

vi.mock("../../../src/lib/features.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../src/lib/features.js")>()),
	get PERSONALITY_GENERATION_ENABLED() {
		return featureFlags.personalityGeneration;
	},
}));

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

async function archiveUserMessages(count: number): Promise<string[]> {
	const sourceMessages: string[] = [];
	for (let index = 0; index < count; index++) {
		const content = userMessage(index);
		sourceMessages.push(content);
		await upsertArchivedChannelMessage({
			guildId: GUILD_ID,
			channelId: CHANNEL_ID,
			authorUserId: USER_ID,
			authorUsername: "ZenE2EUser",
			authorDisplayName: "Zen E2E User",
			messageId: `zen-u-${String(index).padStart(3, "0")}`,
			content,
			messageCreatedAt: new Date(START_DATE.getTime() + index * 1000),
		});
	}
	return sourceMessages;
}

async function archiveGuildMessages(count: number): Promise<string[]> {
	const sourceMessages: string[] = [];
	for (let index = 0; index < count; index++) {
		const content = guildMessage(index);
		sourceMessages.push(content);
		await upsertArchivedChannelMessage({
			guildId: GUILD_ID,
			channelId: CHANNEL_ID,
			authorUserId: `zen-a-${String(index % 20).padStart(2, "0")}`,
			authorUsername: `ZenE2EAuthor${index % 20}`,
			authorDisplayName: `Zen E2E Author ${index % 20}`,
			messageId: `zen-g-${String(index).padStart(3, "0")}`,
			content,
			messageCreatedAt: new Date(START_DATE.getTime() + 200_000 + index * 1000),
		});
	}
	return sourceMessages;
}

function expectGeneratedProfile(profile: string | null | undefined, sourceMessages: string[]): void {
	expect(profile).toBeTypeOf("string");
	const text = profile?.trim() ?? "";
	expect(text.length).toBeGreaterThan(40);
	expect(text.length).toBeLessThan(8_000);
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
			personalityCache: new Map(),
			guildPersonalityCache: new Map(),
		} as unknown as typeof container.client;
	});

	afterEach(async () => {
		await cleanupRows();
	});

	it("builds user and guild profiles from archived training messages through the real Zen provider", async () => {
		const userSourceMessages = await archiveUserMessages(100);
		const guildSourceMessages = await archiveGuildMessages(200);

		const userResult = await buildPersonalityProfile(USER_ID, GUILD_ID);
		const guildResult = await buildGuildPersonalityProfile(GUILD_ID);

		expect(userResult.status).toBe("built");
		expect(guildResult.status).toBe("built");
		const userProfile = await db.query.userPersonalityProfiles.findFirst({
			where: and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)),
		});
		const guildProfile = await db.query.guildPersonalityProfiles.findFirst({
			where: eq(guildPersonalityProfiles.guildId, GUILD_ID),
		});

		expectGeneratedProfile(userProfile?.profile, userSourceMessages);
		expectGeneratedProfile(guildProfile?.profile, guildSourceMessages);
	}, 240_000);
});
