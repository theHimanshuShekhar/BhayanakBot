import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guildPersonalityProfiles, guildSettings, userPersonalityProfiles } from "../../../src/db/schema.js";
import type { BhayanakClient } from "../../../src/lib/BhayanakClient.js";
import { db } from "../../../src/lib/database.js";
import { getPersonalityContext } from "../../../src/lib/personality/getPersonalityContext.js";

const GUILD_ID = "context-guild";
const USER_ID = "context-user";

function createClient(): BhayanakClient {
	return {
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		personalityCache: new Map(),
		guildPersonalityCache: new Map(),
	} as unknown as BhayanakClient;
}

async function cleanupRows(): Promise<void> {
	await db
		.delete(userPersonalityProfiles)
		.where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	await db.delete(guildSettings).where(eq(guildSettings.guildId, GUILD_ID));
}

async function setUserProfile(profile: string | null): Promise<void> {
	await db.insert(userPersonalityProfiles).values({ userId: USER_ID, guildId: GUILD_ID, profile });
}

async function setGuildProfile(profile: string | null): Promise<void> {
	await db.insert(guildPersonalityProfiles).values({ guildId: GUILD_ID, profile });
}

describe("getPersonalityContext", () => {
	beforeEach(async () => {
		await cleanupRows();
		// Query helpers log through the Sapphire container; provide a stub.
		container.logger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		} as unknown as typeof container.logger;
	});

	it("includes only the user profile when no guild profile exists", async () => {
		await setUserProfile("User speaks in clipped sarcastic bursts.");

		const context = await getPersonalityContext(createClient(), USER_ID, GUILD_ID);

		expect(context).toContain("User personality profile:");
		expect(context).toContain("User speaks in clipped sarcastic bursts.");
		expect(context).not.toContain("Server culture profile:");
	});

	it("includes only the guild profile when no user profile exists", async () => {
		await setGuildProfile("Server culture rewards chaotic one-liners.");

		const context = await getPersonalityContext(createClient(), USER_ID, GUILD_ID);

		expect(context).toContain("Server culture profile:");
		expect(context).toContain("Server culture rewards chaotic one-liners.");
		expect(context).not.toContain("User personality profile:");
	});

	it("includes user and guild profiles with distinct labels when both exist", async () => {
		await setUserProfile("User likes deadpan replies.");
		await setGuildProfile("Server culture likes playful pile-ons.");

		const context = await getPersonalityContext(createClient(), USER_ID, GUILD_ID);

		expect(context).toContain("User personality profile:");
		expect(context).toContain("User likes deadpan replies.");
		expect(context).toContain("Server culture profile:");
		expect(context).toContain("Server culture likes playful pile-ons.");
	});

	it("excludes profiles without active profile text", async () => {
		await setUserProfile(null);
		await setGuildProfile(null);

		await expect(getPersonalityContext(createClient(), USER_ID, GUILD_ID)).resolves.toBe("");
	});

	it("returns empty context when personality is disabled for the guild", async () => {
		await db.insert(guildSettings).values({ guildId: GUILD_ID, personalityEnabled: false });
		await setUserProfile("Disabled user profile.");
		await setGuildProfile("Disabled guild profile.");

		await expect(getPersonalityContext(createClient(), USER_ID, GUILD_ID)).resolves.toBe("");
	});

	it("loads a guild profile that appears after an earlier context lookup", async () => {
		const client = createClient();
		await setUserProfile("User profile before guild profile exists.");

		await getPersonalityContext(client, USER_ID, GUILD_ID);
		await setGuildProfile("Guild profile added after first lookup.");

		const context = await getPersonalityContext(client, USER_ID, GUILD_ID);

		expect(context).toContain("User personality profile:");
		expect(context).toContain("Server culture profile:");
		expect(context).toContain("Guild profile added after first lookup.");
	});
});
