import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";

// Opt in with: RUN_OLLAMA_E2E=1 pnpm vitest run tests/e2e/personality/ollama-profile-generation.test.ts
// This disables ZEN_API_KEY during the suite to verify the real local Ollama fallback used by personality builders.
const runOllamaE2e = process.env.RUN_OLLAMA_E2E === "1";
const describeOllamaE2e = runOllamaE2e ? describe : describe.skip;
const originalZenApiKey = process.env.ZEN_API_KEY;

const GUILD_ID = "ollama-guild";
const USER_ID = "ollama-user";
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
			authorUsername: "OllamaE2EUser",
			authorDisplayName: "Ollama E2E User",
			messageId: `ollama-u-${String(index).padStart(3, "0")}`,
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
			authorUserId: `ollama-a-${String(index % 20).padStart(2, "0")}`,
			authorUsername: `OllamaE2EAuthor${index % 20}`,
			authorDisplayName: `Ollama E2E Author ${index % 20}`,
			messageId: `ollama-g-${String(index).padStart(3, "0")}`,
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

describeOllamaE2e("real local Ollama fallback personality profile generation", () => {
	beforeAll(() => {
		delete process.env.ZEN_API_KEY;
	});

	afterAll(() => {
		if (originalZenApiKey === undefined) delete process.env.ZEN_API_KEY;
		else process.env.ZEN_API_KEY = originalZenApiKey;
	});

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

	it("builds user and guild profiles from archived training messages through the real local Ollama fallback", async () => {
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
