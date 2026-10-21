import { container } from "@sapphire/framework";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	archivedChannelMessageTestHooks,
	markArchivedChannelMessageDeleted,
} from "../../../src/db/queries/archivedChannelMessages.js";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../../src/db/schema.js";
import { recordChannelMessage } from "../../../src/lib/autoresponder/replyGuard.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";
import { callBackgroundLlm, callInteractiveLlm } from "../../../src/lib/llmProvider.js";
import { MessageCreateListener } from "../../../src/listeners/messages/messageCreate.js";
import { createListenerContext } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/constants.js", () => ({
	GUESS_WHO_CHANNEL_ID: "guess-general",
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
	addXp: vi.fn(async () => ({ user: {}, leveledUp: false, newLevel: 1, awarded: true })),
}));

vi.mock("../../../src/lib/llmProvider.js", () => ({
	callBackgroundLlm: vi.fn(async () => "Profile summary from listener archived messages."),
	callInteractiveLlm: vi.fn(async () => "Interactive reply."),
}));

const GUILD_ID = "listener-guild";
const RANDOM_CHANNEL_ID = "listener-chat";
const USER_ID = "listener-user";
const OTHER_USER_ID = "listener-other";

// Archiving 100 messages through the listener is several DB round trips per message, so that test is
// genuinely slow under CPU load; the default 5s timeout is only right for single-message tests.
const SLOW_SEED_TIMEOUT_MS = 30_000;

const mockedCallBackgroundLlm = vi.mocked(callBackgroundLlm);
const mockedCallInteractiveLlm = vi.mocked(callInteractiveLlm);
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
	botMentioned?: boolean;
}) {
	const authorId = input.authorId ?? USER_ID;
	const channelId = input.channelId ?? GUESS_WHO_CHANNEL_ID;
	const mentionedUsers = new Map(
		Array.from({ length: input.mentionCount ?? 0 }, (_, index) => [`mentioned-${index}`, { id: `mentioned-${index}` }]),
	);
	return {
		id: input.messageId,
		channelId,
		reference: null,
		content: input.content ?? `Listener archived personality message ${input.messageId} with enough context.`,
		cleanContent: input.content ?? `Listener archived personality message ${input.messageId} with enough context.`,
		createdAt: input.createdAt ?? new Date("2026-05-28T12:00:00.000Z"),
		createdTimestamp: (input.createdAt ?? new Date("2026-05-28T12:00:00.000Z")).getTime(),
		author: {
			id: authorId,
			bot: input.bot ?? false,
			username: authorId,
			globalName: `${authorId}-global`,
			displayName: `${authorId}-global`,
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
			sendTyping: vi.fn(async () => undefined),
			messages: { fetch: vi.fn(async () => new Map()) },
		},
		mentions: {
			users: mentionedUsers,
			has: vi.fn(() => input.botMentioned ?? false),
		},
		client: {
			user: { id: "bot-user", username: "BhayanakBot" },
		},
		reply: vi.fn(async () => ({ delete: vi.fn(async () => null) })),
		delete: vi.fn(async () => null),
	};
}

function createListener(): MessageCreateListener {
	return new MessageCreateListener(createListenerContext("src/listeners/messages/messageCreate.ts"), {});
}

async function cleanupRows(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
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

describe("messageCreate personality archive flow", () => {
	beforeEach(async () => {
		await cleanupRows();
		archivedChannelMessageTestHooks.afterPendingDeleteRead = undefined;
		mockedCallBackgroundLlm.mockClear();
		mockedCallInteractiveLlm.mockClear();
		mockedGetOrCreateSettings.mockReset();
		mockedGetOrCreateSettings.mockImplementation(async (guildId: string) => createSettings({ guildId }) as never);
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
		container.client = {
			guilds: { cache: new Map() },
			users: { cache: new Map() },
			logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		} as unknown as typeof container.client;
	});

	it("archives human messages from the Guess Who general channel", async () => {
		await createListener().run(createMessage({ messageId: "live-eligible" }) as never);

		expect(await getArchiveRow("live-eligible")).toMatchObject({
			channelId: GUESS_WHO_CHANNEL_ID,
			authorUserId: USER_ID,
			content: "Listener archived personality message live-eligible with enough context.",
		});
	});

	it("keeps no personality evidence counters: archiving writes no profile rows", async () => {
		await createListener().run(createMessage({ messageId: "no-counter" }) as never);

		expect(await getArchiveRow("no-counter")).toBeDefined();
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("does not archive messages outside the Guess Who general channel", async () => {
		await createListener().run(createMessage({ messageId: "legacy-channel", channelId: RANDOM_CHANNEL_ID }) as never);

		expect(await getArchiveRow("legacy-channel")).toBeUndefined();
	});

	it("does not archive bot messages in the Guess Who general channel", async () => {
		await createListener().run(createMessage({ messageId: "bot-message", bot: true }) as never);

		expect(await getArchiveRow("bot-message")).toBeUndefined();
	});

	it("archives a duplicate listener delivery once", async () => {
		const listener = createListener();
		const message = createMessage({ messageId: "duplicate-live" });

		await listener.run(message as never);
		await listener.run(message as never);

		expect(await countArchivedRows()).toBe(1);
	});

	it("keeps the deleted mark when create arrives after a pending delete", async () => {
		await markArchivedChannelMessageDeleted("delete-before-create", new Date("2026-05-28T11:59:00.000Z"));

		await createListener().run(createMessage({ messageId: "delete-before-create" }) as never);

		expect(await getArchiveRow("delete-before-create")).toMatchObject({
			messageId: "delete-before-create",
			deletedAt: new Date("2026-05-28T11:59:00.000Z"),
		});
	});

	it("keeps the deleted mark when delete arrives during archive upsert", async () => {
		archivedChannelMessageTestHooks.afterPendingDeleteRead = async () => {
			archivedChannelMessageTestHooks.afterPendingDeleteRead = undefined;
			await markArchivedChannelMessageDeleted("delete-during-create", new Date("2026-05-28T11:59:30.000Z"));
		};

		await createListener().run(createMessage({ messageId: "delete-during-create" }) as never);

		expect(await getArchiveRow("delete-during-create")).toMatchObject({
			messageId: "delete-during-create",
			deletedAt: new Date("2026-05-28T11:59:30.000Z"),
		});
	});

	it("archives mass-mention messages; training eligibility is decided later by the archive queries", async () => {
		await createListener().run(
			createMessage({
				messageId: "mass-mention",
				content: "This message has enough alphabetic content but calls @everyone into chat.",
			}) as never,
		);

		expect(await getArchiveRow("mass-mention")).toBeDefined();
	});

	it("never builds a profile from the message path, however many messages arrive", {
		timeout: SLOW_SEED_TIMEOUT_MS,
	}, async () => {
		await archiveListenerMessages({ count: 100 });
		await createListener().run(
			createMessage({ messageId: "past-user-threshold", createdAt: new Date("2026-05-28T12:10:00.000Z") }) as never,
		);

		expect(await countArchivedRows()).toBe(101);
		expect(mockedCallBackgroundLlm).not.toHaveBeenCalled();
		expect(await getUserProfile()).toBeUndefined();
		expect(await getGuildProfile()).toBeUndefined();
	});

	it("gives a Random Reply the guild culture profile only", async () => {
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
				createSettings({
					guildId,
					randomResponseChannelId: RANDOM_CHANNEL_ID,
					randomResponseChance: 100,
				}) as never,
		);
		mockedCallBackgroundLlm.mockClear();
		for (const userId of ["warm-a", "warm-b", "warm-a", "warm-b"]) recordChannelMessage(RANDOM_CHANNEL_ID, userId);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

		try {
			await createListener().run(createMessage({ messageId: "random-context", channelId: RANDOM_CHANNEL_ID }) as never);
		} finally {
			randomSpy.mockRestore();
		}

		const [systemPrompt, , , options] = mockedCallBackgroundLlm.mock.calls[0] ?? [];
		expect(systemPrompt).toContain("Guild culture belongs in random context.");
		expect(systemPrompt).not.toContain("Triggering user's private profile should not be in random context.");
		expect(options).toMatchObject({ session: `random:${RANDOM_CHANNEL_ID}` });
	});

	it("gives a Mention Reply the guild culture and the member profile, with the personality toggle's profile gate intact", async () => {
		await db.insert(userPersonalityProfiles).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			profile: "Member profile belongs in a mention reply.",
		});
		await db.insert(guildPersonalityProfiles).values({
			guildId: GUILD_ID,
			profile: "Guild culture belongs in a mention reply.",
		});
		const message = createMessage({
			messageId: "mention-context",
			channelId: RANDOM_CHANNEL_ID,
			content: "<@bot-user> say something",
			botMentioned: true,
		});

		await createListener().run(message as never);

		const [systemPrompt, , , options] = mockedCallInteractiveLlm.mock.calls[0] ?? [];
		expect(systemPrompt).toContain("Member profile belongs in a mention reply.");
		expect(systemPrompt).toContain("Guild culture belongs in a mention reply.");
		expect(options).toMatchObject({ session: `mention:${RANDOM_CHANNEL_ID}` });
		expect(message.reply).toHaveBeenCalledWith("Interactive reply.");
	});
});
