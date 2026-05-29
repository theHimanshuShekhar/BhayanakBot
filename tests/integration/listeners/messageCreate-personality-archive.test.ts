import { container } from "@sapphire/framework";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import {
	archivedChannelMessageTestHooks,
	markArchivedChannelMessageDeleted,
} from "../../../src/db/queries/archivedChannelMessages.js";
import {
	archivedChannelMessages,
	guildPersonalityProfiles,
	userMessages,
	userPersonalityProfiles,
} from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";
import { GUESS_WHO_CHANNEL_ID, TARGET_TEXT_CHANNEL_ID } from "../../../src/lib/constants.js";
import { generateMentionReply } from "../../../src/lib/autoresponder/llmResponse.js";
import { callOllamaLowPriority } from "../../../src/lib/ollama.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";
import { MessageCreateListener } from "../../../src/listeners/messages/messageCreate.js";
import { createListenerContext } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/constants.js", () => ({
	GUESS_WHO_CHANNEL_ID: "guess-general",
	TARGET_TEXT_CHANNEL_ID: "legacy-target",
	TARGET_GUILD_ID: "listener-guild",
	GUESS_WHO_BACKFILL_LIMIT: 1000,
	BOT_OWNER_ID: "bot-owner",
}));

vi.mock("../../../src/db/queries/afk.js", () => ({
	clearAfk: vi.fn(),
	getAfk: vi.fn(async () => null),
}));

vi.mock("../../../src/db/queries/autoResponses.js", () => ({
	findMatchingResponse: vi.fn(async () => null),
}));

vi.mock("../../../src/db/queries/guildSettings.js", () => ({
	getOrCreateSettings: vi.fn(async (guildId: string) => ({
		guildId,
		personalityEnabled: true,
		autoModEnabled: false,
		xpCooldownSeconds: 60,
		xpRate: 10,
		randomResponseChannelId: null,
		randomResponseChance: 0,
	})),
}));

vi.mock("../../../src/db/queries/modCases.js", () => ({
	createCase: vi.fn(),
}));

vi.mock("../../../src/db/queries/users.js", () => ({
	addXp: vi.fn(async () => ({ user: { lastMessageAt: new Date() }, leveledUp: false, newLevel: 1 })),
}));

vi.mock("../../../src/lib/autoresponder/llmResponse.js", () => ({
	generateAutoResponse: vi.fn(),
	generateMentionReply: vi.fn(),
}));

vi.mock("../../../src/lib/ollama.js", () => ({
	callOllamaLowPriority: vi.fn(async () => "Profile summary from listener archived messages."),
}));

const GUILD_ID = "listener-guild";
const USER_ID = "listener-user";
const OTHER_USER_ID = "listener-other";

const mockedCallOllamaLowPriority = vi.mocked(callOllamaLowPriority);
const mockedGenerateMentionReply = vi.mocked(generateMentionReply);
const mockedGetOrCreateSettings = vi.mocked(getOrCreateSettings);

function createSettings(overrides: Record<string, unknown> = {}) {
	return {
		guildId: GUILD_ID,
		personalityEnabled: true,
		autoModEnabled: false,
		xpCooldownSeconds: 60,
		xpRate: 10,
		randomResponseChannelId: null,
		randomResponseChance: 0,
		...overrides,
	};
}

function createMessage(input: {
	messageId: string;
	channelId?: string;
	authorId?: string;
	content?: string;
	createdAt?: Date;
	bot?: boolean;
	mentionCount?: number;
}) {
	const authorId = input.authorId ?? USER_ID;
	const channelId = input.channelId ?? GUESS_WHO_CHANNEL_ID;
	const mentionedUsers = new Map(
		Array.from({ length: input.mentionCount ?? 0 }, (_, index) => [`mentioned-${index}`, { id: `mentioned-${index}` }]),
	);
	return {
		id: input.messageId,
		channelId,
		content: input.content ?? `Listener archived personality message ${input.messageId} with enough context.`,
		createdAt: input.createdAt ?? new Date("2026-05-28T12:00:00.000Z"),
		author: {
			id: authorId,
			bot: input.bot ?? false,
			username: authorId,
			globalName: `${authorId}-global`,
			send: vi.fn(async () => null),
		},
		guild: {
			id: GUILD_ID,
			name: "Listener Guild",
			roles: { cache: new Map() },
			channels: { cache: new Map() },
			members: { cache: new Map() },
		},
		member: {
			displayName: `${authorId}-display`,
			permissions: { has: vi.fn(() => false) },
			roles: { add: vi.fn(async () => null) },
		},
		channel: {
			id: channelId,
			send: vi.fn(async () => null),
		},
		mentions: {
			users: mentionedUsers,
			has: vi.fn(() => false),
		},
		client: {
			user: { id: "bot-user", username: "BhayanakBot" },
		},
		reply: vi.fn(async () => ({ delete: vi.fn(async () => null) })),
		delete: vi.fn(async () => null),
	} as never;
}

function createListener(): MessageCreateListener {
	return new MessageCreateListener(createListenerContext("src/listeners/messages/messageCreate.ts"), {});
}

async function cleanupRows(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	await db.delete(userMessages).where(eq(userMessages.guildId, GUILD_ID));
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	await db.delete(userPersonalityProfiles).where(eq(userPersonalityProfiles.guildId, GUILD_ID));
}

async function getArchiveRow(messageId: string) {
	return db.query.archivedChannelMessages.findFirst({ where: eq(archivedChannelMessages.messageId, messageId) });
}

async function getUserProfile(userId = USER_ID) {
	return db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, GUILD_ID)),
	});
}

async function getGuildProfile() {
	return db.query.guildPersonalityProfiles.findFirst({ where: eq(guildPersonalityProfiles.guildId, GUILD_ID) });
}

async function archiveListenerMessages(input: { count: number; authorCount?: number }): Promise<void> {
	const listener = createListener();
	const start = new Date("2026-05-28T12:00:00.000Z");
	for (let index = 0; index < input.count; index++) {
		const authorIndex = input.authorCount ? index % input.authorCount : 0;
		await listener.run(
			createMessage({
				messageId: `lm${String(index).padStart(3, "0")}`,
				authorId: authorIndex === 0 ? USER_ID : `${OTHER_USER_ID}${authorIndex}`,
				createdAt: new Date(start.getTime() + index * 1000),
			}) as never,
		);
	}
}

async function countArchivedRows(): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(archivedChannelMessages)
		.where(eq(archivedChannelMessages.guildId, GUILD_ID));
	return row?.count ?? 0;
}

async function countStoredUserMessages(): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(userMessages)
		.where(and(eq(userMessages.userId, USER_ID), eq(userMessages.guildId, GUILD_ID)));
	return row?.count ?? 0;
}

describe("messageCreate personality archive flow", () => {
	beforeEach(async () => {
		await cleanupRows();
		archivedChannelMessageTestHooks.afterPendingDeleteRead = undefined;
		mockedCallOllamaLowPriority.mockClear();
		mockedGenerateMentionReply.mockClear();
		mockedGetOrCreateSettings.mockReset();
		mockedGetOrCreateSettings.mockImplementation(async (guildId: string) => createSettings({ guildId }) as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = {
			guilds: { cache: new Map() },
			users: { cache: new Map() },
			personalityCache: new Map(),
			guildPersonalityCache: new Map(),
		} as unknown as typeof container.client;
	});

	it("archives eligible human messages from the Guess Who general channel and increments personality counters", async () => {
		await createListener().run(createMessage({ messageId: "live-eligible" }) as never);

		expect(await getArchiveRow("live-eligible")).toMatchObject({
			channelId: GUESS_WHO_CHANNEL_ID,
			authorUserId: USER_ID,
			content: "Listener archived personality message live-eligible with enough context.",
		});
		expect((await getUserProfile())?.newMessageCount).toBe(1);
		expect((await getGuildProfile())?.messageCount).toBe(1);
	});

	it("does not archive or increment personality evidence outside the Guess Who general channel", async () => {
		await createListener().run(createMessage({ messageId: "legacy-channel", channelId: TARGET_TEXT_CHANNEL_ID }) as never);

		expect(await getArchiveRow("legacy-channel")).toBeUndefined();
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("does not archive or increment bot messages in the Guess Who general channel", async () => {
		await createListener().run(createMessage({ messageId: "bot-message", bot: true }) as never);

		expect(await getArchiveRow("bot-message")).toBeUndefined();
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("does not increment personality evidence twice for duplicate listener delivery", async () => {
		const listener = createListener();
		const message = createMessage({ messageId: "duplicate-live" });

		await listener.run(message as never);
		await listener.run(message as never);

		expect(await countArchivedRows()).toBe(1);
		expect(await countStoredUserMessages()).toBe(1);
		expect((await getUserProfile())?.newMessageCount).toBe(1);
		expect((await getGuildProfile())?.messageCount).toBe(1);
	});

	it("does not increment personality evidence when create arrives after a pending delete", async () => {
		await markArchivedChannelMessageDeleted("delete-before-create", new Date("2026-05-28T11:59:00.000Z"));

		await createListener().run(createMessage({ messageId: "delete-before-create" }) as never);

		expect(await getArchiveRow("delete-before-create")).toMatchObject({
			messageId: "delete-before-create",
			deletedAt: new Date("2026-05-28T11:59:00.000Z"),
		});
		expect(await countStoredUserMessages()).toBe(0);
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("does not increment personality evidence when delete arrives during archive upsert", async () => {
		archivedChannelMessageTestHooks.afterPendingDeleteRead = async () => {
			archivedChannelMessageTestHooks.afterPendingDeleteRead = undefined;
			await markArchivedChannelMessageDeleted("delete-during-create", new Date("2026-05-28T11:59:30.000Z"));
		};

		await createListener().run(createMessage({ messageId: "delete-during-create" }) as never);

		expect(await getArchiveRow("delete-during-create")).toMatchObject({
			messageId: "delete-during-create",
			deletedAt: new Date("2026-05-28T11:59:30.000Z"),
		});
		expect(await countStoredUserMessages()).toBe(0);
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("archives mass-mention messages without incrementing personality evidence", async () => {
		await createListener().run(
			createMessage({
				messageId: "mass-mention",
				content: "This message has enough alphabetic content but calls @everyone into chat.",
			}) as never,
		);
		await createListener().run(
			createMessage({
				messageId: "here-mention",
				content: "This message has enough alphabetic content but calls @here into chat.",
			}) as never,
		);

		expect(await getArchiveRow("mass-mention")).toBeDefined();
		expect(await getArchiveRow("here-mention")).toBeDefined();
		expect(await countStoredUserMessages()).toBe(0);
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("archives user mass-mention messages without incrementing personality evidence", async () => {
		await createListener().run(
			createMessage({
				messageId: "user-mass-mention",
				mentionCount: 5,
				content: "This message pings many users but has enough alphabetic context for filters.",
			}) as never,
		);
		await createListener().run(
			createMessage({
				messageId: "repeat-mention",
				mentionCount: 1,
				content:
					"This repeats <@100000000000000001> <@100000000000000001> <@100000000000000001> <@100000000000000001> <@100000000000000001> enough times.",
			}) as never,
		);

		expect(await getArchiveRow("user-mass-mention")).toBeDefined();
		expect(await getArchiveRow("repeat-mention")).toBeDefined();
		expect(await countStoredUserMessages()).toBe(0);
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("builds a user profile from messages inserted through the listener archive flow", async () => {
		await db.insert(userPersonalityProfiles).values({ userId: USER_ID, guildId: GUILD_ID, newMessageCount: -100 });
		await archiveListenerMessages({ count: 100 });

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(await countArchivedRows()).toBe(100);
		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		expect((await getUserProfile())?.profile).toBe("Profile summary from listener archived messages.");
	});

	it("listener-triggered threshold build sees the triggering archived message", async () => {
		await archiveListenerMessages({ count: 99 });
		mockedCallOllamaLowPriority.mockClear();

		await createListener().run(
			createMessage({
				messageId: "threshold-live",
				createdAt: new Date("2026-05-28T12:02:00.000Z"),
				content: "Threshold triggering archived message must be visible to builder.",
			}) as never,
		);

		await vi.waitFor(() => expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1));
		expect(mockedCallOllamaLowPriority.mock.calls[0]?.[1]).toContain(
			"Threshold triggering archived message must be visible to builder.",
		);
		expect((await getUserProfile())?.profile).toBe("Profile summary from listener archived messages.");
	});

	it("builds a guild profile from messages inserted through the listener archive flow", async () => {
		await db.insert(guildPersonalityProfiles).values({ guildId: GUILD_ID, messageCount: -200 });
		await archiveListenerMessages({ count: 200, authorCount: 20 });

		await buildGuildPersonalityProfile(GUILD_ID);

		expect(await countArchivedRows()).toBe(200);
		expect(mockedCallOllamaLowPriority).toHaveBeenCalledTimes(1);
		expect((await getGuildProfile())?.profile).toBe("Profile summary from listener archived messages.");
	});

	it("does not train on listener-archived messages that are too short or later deleted", async () => {
		await db.insert(userPersonalityProfiles).values({ userId: USER_ID, guildId: GUILD_ID, newMessageCount: -100 });
		const listener = createListener();
		await listener.run(createMessage({ messageId: "short-row", content: "too short" }) as never);
		for (let index = 0; index < 100; index++) {
			await listener.run(
				createMessage({
					messageId: `ld${String(index).padStart(3, "0")}`,
					createdAt: new Date(new Date("2026-05-28T13:00:00.000Z").getTime() + index * 1000),
				}) as never,
			);
		}
		await markArchivedChannelMessageDeleted("ld099", new Date("2026-05-28T14:00:00.000Z"));
		mockedCallOllamaLowPriority.mockClear();

		await buildPersonalityProfile(USER_ID, GUILD_ID);

		expect(await getArchiveRow("short-row")).toBeDefined();
		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
		expect((await getUserProfile())?.profile).toBeNull();
	});

	it("keeps random unsolicited response context guild-culture-only", async () => {
		await db.insert(userPersonalityProfiles).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			profile: "Triggering user's private profile should not be in random context.",
		});
		await db.insert(guildPersonalityProfiles).values({
			guildId: GUILD_ID,
			profile: "Guild culture belongs in random context.",
		});
		mockedGetOrCreateSettings.mockImplementationOnce(
			async (guildId: string) =>
				createSettings({ guildId, randomResponseChannelId: TARGET_TEXT_CHANNEL_ID, randomResponseChance: 100 }) as never,
		);
		mockedGenerateMentionReply.mockResolvedValueOnce("random reply");
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

		try {
			await createListener().run(
				createMessage({ messageId: "random-context", channelId: TARGET_TEXT_CHANNEL_ID }) as never,
			);
		} finally {
			randomSpy.mockRestore();
		}

		const systemPrompt = mockedGenerateMentionReply.mock.calls[0]?.[0] ?? "";
		expect(systemPrompt).toContain("Guild culture belongs in random context.");
		expect(systemPrompt).not.toContain("Triggering user's private profile should not be in random context.");
	});
});
