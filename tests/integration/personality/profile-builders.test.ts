import { container } from "@sapphire/framework";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { callOllamaLowPriority } from "../../../src/lib/ollama.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";

vi.mock("../../../src/lib/ollama.js", () => ({
	callOllamaLowPriority: vi.fn(async () => "Profile summary without direct quotes."),
}));

const GUILD_ID = "builder-guild";
const CHANNEL_ID = GUESS_WHO_CHANNEL_ID;
const NON_GENERAL_CHANNEL_ID = "builder-non-general";
const USER_ID = "builder-user";

const mockedCallOllamaLowPriority = vi.mocked(callOllamaLowPriority);

async function cleanupBuilderRows(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	await db
		.delete(userPersonalityProfiles)
		.where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
}

async function archiveUserMessages(input: { count: number; idPrefix: string; start: Date; channelId?: string }): Promise<void> {
	for (let index = 0; index < input.count; index++) {
		const paddedIndex = String(index).padStart(3, "0");
		await upsertArchivedChannelMessage({
			guildId: GUILD_ID,
			channelId: input.channelId ?? CHANNEL_ID,
			authorUserId: USER_ID,
			authorUsername: USER_ID,
			authorDisplayName: USER_ID,
			messageId: `${input.idPrefix}-${paddedIndex}`,
			content: `Archived eligible message ${input.idPrefix} ${paddedIndex} with enough personality context.`,
			messageCreatedAt: new Date(input.start.getTime() + index * 1000),
		});
	}
}

async function archiveGuildMessages(input: { count: number; idPrefix: string; start: Date; authorCount: number }): Promise<void> {
	for (let index = 0; index < input.count; index++) {
		const paddedIndex = String(index).padStart(3, "0");
		const authorIndex = index % input.authorCount;
		const authorUserId = `author-${String(authorIndex).padStart(2, "0")}`;
		await archiveGuildMessage({
			authorUserId,
			messageId: `${input.idPrefix}${paddedIndex}`,
			content: `guild ${input.idPrefix}${paddedIndex} context`,
			messageCreatedAt: new Date(input.start.getTime() + index * 1000),
		});
	}
}

async function archiveGuildMessagesForAuthor(input: {
	count: number;
	idPrefix: string;
	start: Date;
	authorUserId: string;
}): Promise<void> {
	for (let index = 0; index < input.count; index++) {
		const paddedIndex = String(index).padStart(3, "0");
		await archiveGuildMessage({
			authorUserId: input.authorUserId,
			messageId: `${input.idPrefix}${paddedIndex}`,
			content: `guild ${input.idPrefix}${paddedIndex} context`,
			messageCreatedAt: new Date(input.start.getTime() + index * 1000),
		});
	}
}

async function archiveGuildMessage(input: {
	authorUserId: string;
	messageId: string;
	channelId?: string;
	content: string;
	messageCreatedAt: Date;
}): Promise<void> {
	await upsertArchivedChannelMessage({
		guildId: GUILD_ID,
		channelId: input.channelId ?? CHANNEL_ID,
		authorUserId: input.authorUserId,
		authorUsername: input.authorUserId,
		authorDisplayName: input.authorUserId,
		messageId: input.messageId,
		content: input.content,
		messageCreatedAt: input.messageCreatedAt,
	});
}

async function getBuilderProfile() {
	return db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)),
	});
}

async function getGuildBuilderProfile() {
	return db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, GUILD_ID),
	});
}

async function countArchivedRows(): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(archivedChannelMessages)
		.where(eq(archivedChannelMessages.guildId, GUILD_ID));
	return row?.count ?? 0;
}

function countPromptLinesByAuthor(userPrompt: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const line of userPrompt.split("\n")) {
		const match = /^(Author \d+): /.exec(line);
		if (!match) continue;
		const authorLabel = match[1];
		counts.set(authorLabel, (counts.get(authorLabel) ?? 0) + 1);
	}
	return counts;
}

function authorLabelForPromptContent(userPrompt: string, content: string): string | null {
	const line = userPrompt.split("\n").find((promptLine) => promptLine.includes(content));
	return /^(Author \d+): /.exec(line ?? "")?.[1] ?? null;
}

describe("personality profile builders", () => {
	beforeEach(async () => {
		await cleanupBuilderRows();
		mockedCallOllamaLowPriority.mockClear();
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

	it("does not build an initial user profile below the archive message threshold", async () => {
		await archiveUserMessages({ count: 99, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
		expect(await getBuilderProfile()).toBeUndefined();
	});

	it("builds an initial user profile from 100 archived eligible messages", async () => {
		await archiveUserMessages({ count: 100, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		expect((await getBuilderProfile())?.profile).toBe("Profile summary without direct quotes.");
	});

	it("does not build a user profile from non-general-channel archived messages", async () => {
		await archiveUserMessages({
			count: 100,
			idPrefix: "pbo",
			start: new Date("2026-05-01T00:00:00.000Z"),
			channelId: NON_GENERAL_CHANNEL_ID,
		});

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
		expect(await getBuilderProfile()).toBeUndefined();
	});

	it("does not delete archive rows after a user profile build", async () => {
		await archiveUserMessages({ count: 100, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(await countArchivedRows()).toBe(100);
	});

	it("advances the profile cursor to the newest processed archive message", async () => {
		const start = new Date("2026-05-01T00:00:00.000Z");
		await archiveUserMessages({ count: 100, idPrefix: "pb", start });

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		const profile = await getBuilderProfile();
		expect(profile?.lastTrainingMessageAt?.toISOString()).toBe(new Date(start.getTime() + 99_000).toISOString());
		expect(profile?.lastTrainingMessageId).toBe("pb-099");
	});

	it("instructs the model not to quote source messages directly", async () => {
		await archiveUserMessages({ count: 100, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		const [systemPrompt, userPrompt] = mockedCallOllamaLowPriority.mock.calls[0] ?? [];
		expect(`${systemPrompt}\n${userPrompt}`.toLowerCase()).toContain("do not quote source messages directly");
	});

	it("uses only messages after the cursor for an incremental build and includes the existing profile in the prompt", async () => {
		await archiveUserMessages({ count: 100, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });
		await buildPersonalityProfile(USER_ID, GUILD_ID);
		await archiveUserMessages({ count: 20, idPrefix: "pi", start: new Date("2026-05-02T00:00:00.000Z") });
		await db
			.update(userPersonalityProfiles)
			.set({ lastRefreshedAt: new Date("2026-05-01T00:00:00.000Z") })
			.where(and(eq(userPersonalityProfiles.userId, USER_ID), eq(userPersonalityProfiles.guildId, GUILD_ID)));
		mockedCallOllamaLowPriority.mockClear();

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		const userPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		expect(userPrompt).toContain("Current personality profile:");
		expect(userPrompt).toContain("Profile summary without direct quotes.");
		expect(userPrompt).toContain("Archived eligible message pi 000");
		expect(userPrompt).not.toContain("Archived eligible message pb 099");
	});

	it("sets lastRefreshedAt after a null model result so an immediate retry is cooldowned", async () => {
		await archiveUserMessages({ count: 100, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });
		mockedCallOllamaLowPriority.mockResolvedValueOnce(null);

		await buildPersonalityProfile(USER_ID, GUILD_ID);
		const profileAfterFailure = await getBuilderProfile();
		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(profileAfterFailure?.profile).toBeNull();
		expect(profileAfterFailure?.lastRefreshedAt).toBeInstanceOf(Date);
		expect(profileAfterFailure?.lastTrainingMessageAt).toBeNull();
		expect(profileAfterFailure?.lastTrainingMessageId).toBeNull();
		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
	});

	it("does not reduce newMessageCount to the capped fetched batch size after a null model result", async () => {
		await archiveUserMessages({ count: 100, idPrefix: "pb", start: new Date("2026-05-01T00:00:00.000Z") });
		await db.insert(userPersonalityProfiles).values({ userId: USER_ID, guildId: GUILD_ID, newMessageCount: 125 });
		mockedCallOllamaLowPriority.mockResolvedValueOnce(null);

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect((await getBuilderProfile())?.newMessageCount).toBe(125);
	});

	it("does not build an initial guild profile below the archive message threshold", async () => {
		await archiveGuildMessages({ count: 199, idPrefix: "gb", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
		expect(await getGuildBuilderProfile()).toBeUndefined();
	});

	it("builds an initial guild profile from 200 archived eligible messages", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gb", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		expect((await getGuildBuilderProfile())?.profile).toBe("Profile summary without direct quotes.");
	});

	it("does not build a guild profile from non-general-channel archived messages", async () => {
		const start = new Date("2026-05-01T00:00:00.000Z");
		for (let index = 0; index < 200; index++) {
			await archiveGuildMessage({
				authorUserId: `off-author-${index % 20}`,
				messageId: `off${String(index).padStart(3, "0")}`,
				channelId: NON_GENERAL_CHANNEL_ID,
				content: `off channel guild message ${index} should not train`,
				messageCreatedAt: new Date(start.getTime() + index * 1000),
			});
		}

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
		expect(await getGuildBuilderProfile()).toBeUndefined();
	});

	it("does not refresh an existing guild profile below the post-cursor archive message threshold", async () => {
		const lastTrainingMessageAt = new Date("2026-05-01T00:00:00.000Z");
		await db.insert(guildPersonalityProfiles).values({
			guildId: GUILD_ID,
			profile: "Existing guild profile.",
			lastTrainingMessageAt,
			lastTrainingMessageId: "seed000",
		});
		await archiveGuildMessages({
			count: 39,
			idPrefix: "gr",
			start: new Date(lastTrainingMessageAt.getTime() + 1000),
			authorCount: 4,
		});

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
		expect((await getGuildBuilderProfile())?.lastTrainingMessageId).toBe("seed000");
	});

	it("builds a dominated initial guild profile and caps prompt lines to 10 per anonymized author", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gd", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 5 });

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		const userPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		for (const count of countPromptLinesByAuthor(userPrompt).values()) {
			expect(count).toBeLessThanOrEqual(10);
		}
		expect((await getGuildBuilderProfile())?.lastTrainingMessageId).toBe("gd199");
	});

	it("uses stable anonymized author labels in the guild prompt", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gb", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });

		await buildGuildPersonalityProfile(GUILD_ID);

		const userPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		expect(authorLabelForPromptContent(userPrompt, "guild gb000 context")).toMatch(/^Author \d+(?:\.\d+)?$/);
		expect(authorLabelForPromptContent(userPrompt, "guild gb001 context")).toMatch(/^Author \d+(?:\.\d+)?$/);
		expect(userPrompt).not.toContain("author-00");
		expect(userPrompt).not.toContain("author-01");
	});

	it("keeps anonymized guild author labels stable across incremental builds", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gs", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });
		await buildGuildPersonalityProfile(GUILD_ID);
		const firstPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		const firstBuildLabel = authorLabelForPromptContent(firstPrompt, "guild gs001 context");
		await archiveGuildMessagesForAuthor({
			count: 40,
			idPrefix: "gt",
			start: new Date("2026-05-02T00:00:00.000Z"),
			authorUserId: "author-01",
		});
		await db
			.update(guildPersonalityProfiles)
			.set({ lastRefreshedAt: new Date("2026-05-01T00:00:00.000Z") })
			.where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
		mockedCallOllamaLowPriority.mockClear();

		await buildGuildPersonalityProfile(GUILD_ID);

		const secondPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		expect(authorLabelForPromptContent(secondPrompt, "guild gt000 context")).toBe(firstBuildLabel);
		expect(secondPrompt).not.toContain("author-01");
	});

	it("advances the guild profile cursor to the newest processed archive message", async () => {
		const start = new Date("2026-05-01T00:00:00.000Z");
		await archiveGuildMessages({ count: 200, idPrefix: "gb", start, authorCount: 20 });

		await buildGuildPersonalityProfile(GUILD_ID);

		const profile = await getGuildBuilderProfile();
		expect(profile?.lastTrainingMessageAt?.toISOString()).toBe(new Date(start.getTime() + 199_000).toISOString());
		expect(profile?.lastTrainingMessageId).toBe("gb199");
	});

	it("uses only messages after the guild cursor for an incremental build and includes the existing profile in the prompt", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gb", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });
		await buildGuildPersonalityProfile(GUILD_ID);
		await archiveGuildMessages({ count: 40, idPrefix: "gi", start: new Date("2026-05-02T00:00:00.000Z"), authorCount: 4 });
		await db
			.update(guildPersonalityProfiles)
			.set({ lastRefreshedAt: new Date("2026-05-01T00:00:00.000Z") })
			.where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
		mockedCallOllamaLowPriority.mockClear();

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		const userPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		expect(userPrompt).toContain("Current server culture profile:");
		expect(userPrompt).toContain("Profile summary without direct quotes.");
		expect(userPrompt).toContain("guild gi000 context");
		expect(userPrompt).not.toContain("guild gb199 context");
	});

	it("advances guild cursor by contiguous processed windows without permanently skipping balanced-out messages", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gc", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });
		await buildGuildPersonalityProfile(GUILD_ID);
		await archiveGuildMessagesForAuthor({
			count: 50,
			idPrefix: "gx",
			start: new Date("2026-05-02T00:00:00.000Z"),
			authorUserId: "author-00",
		});
		await archiveGuildMessagesForAuthor({
			count: 40,
			idPrefix: "gy",
			start: new Date("2026-05-02T00:10:00.000Z"),
			authorUserId: "author-01",
		});
		await db
			.update(guildPersonalityProfiles)
			.set({ lastRefreshedAt: new Date("2026-05-01T00:00:00.000Z") })
			.where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
		mockedCallOllamaLowPriority.mockClear();

		await buildGuildPersonalityProfile(GUILD_ID);
		const firstRefreshProfile = await getGuildBuilderProfile();
		await db
			.update(guildPersonalityProfiles)
			.set({ lastRefreshedAt: new Date("2026-05-01T00:00:00.000Z") })
			.where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
		mockedCallOllamaLowPriority.mockClear();
		await buildGuildPersonalityProfile(GUILD_ID);

		const secondRefreshPrompt = mockedCallOllamaLowPriority.mock.calls[0]?.[1] ?? "";
		expect(firstRefreshProfile?.lastTrainingMessageId).toBe("gx039");
		expect(secondRefreshPrompt).toContain("guild gx040 context");
		expect(secondRefreshPrompt).toContain("guild gy000 context");
		expect((await getGuildBuilderProfile())?.lastTrainingMessageId).toBe("gy029");
	});

	it("sets guild cooldown after a null model result without advancing cursor or reducing messageCount", async () => {
		await archiveGuildMessages({ count: 200, idPrefix: "gb", start: new Date("2026-05-01T00:00:00.000Z"), authorCount: 20 });
		await db.insert(guildPersonalityProfiles).values({ guildId: GUILD_ID, messageCount: 250 });
		mockedCallOllamaLowPriority.mockResolvedValueOnce(null);

		await buildGuildPersonalityProfile(GUILD_ID);
		const profileAfterFailure = await getGuildBuilderProfile();
		await buildGuildPersonalityProfile(GUILD_ID);

		expect(profileAfterFailure?.profile).toBeNull();
		expect(profileAfterFailure?.lastRefreshedAt).toBeInstanceOf(Date);
		expect(profileAfterFailure?.lastTrainingMessageAt).toBeNull();
		expect(profileAfterFailure?.lastTrainingMessageId).toBeNull();
		expect(profileAfterFailure?.messageCount).toBe(250);
		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
	});
});
