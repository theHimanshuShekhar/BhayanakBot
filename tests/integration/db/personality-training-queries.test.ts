import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	isArchivedChannelMessageDeleted,
	markArchivedChannelMessageDeleted,
	upsertArchivedChannelMessage,
} from "../../../src/db/queries/archivedChannelMessages.js";
import {
	getEligibleGuildTrainingMessages,
	getEligibleGuildTrainingMessageWindow,
	getEligibleUserTrainingMessages,
} from "../../../src/db/queries/personalityTraining.js";
import { archivedChannelMessages } from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "guild-persona-test";
const CHANNEL_ID = GUESS_WHO_CHANNEL_ID;
const NON_GENERAL_CHANNEL_ID = "not-general-test";
const USER_A = "user-a";
const USER_B = "user-b";

async function cleanupPersonalityTrainingMessages(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
}

async function archiveMessage(input: {
	messageId: string;
	authorUserId?: string;
	channelId?: string;
	content: string;
	messageCreatedAt: Date;
}): Promise<void> {
	await upsertArchivedChannelMessage({
		guildId: GUILD_ID,
		channelId: input.channelId ?? CHANNEL_ID,
		authorUserId: input.authorUserId ?? USER_A,
		authorUsername: input.authorUserId ?? USER_A,
		authorDisplayName: input.authorUserId ?? USER_A,
		messageId: input.messageId,
		content: input.content,
		messageCreatedAt: input.messageCreatedAt,
	});
}

describe("personality training database queries", () => {
	beforeEach(async () => {
		await cleanupPersonalityTrainingMessages();
	});

	it("returns only meaningful non-command non-deleted user messages in chronological order", async () => {
		await archiveMessage({
			messageId: "pt-user-valid-2",
			content: "Second thoughtful user message for training.",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-short",
			content: "too short",
			messageCreatedAt: new Date("2026-05-27T12:03:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-pad-short",
			content: "   tiny text   ",
			messageCreatedAt: new Date("2026-05-27T12:03:30.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-command-1",
			content: "/imagine something interesting for the bot",
			messageCreatedAt: new Date("2026-05-27T12:04:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-pad-slash",
			content: "   /imagine something interesting for the bot",
			messageCreatedAt: new Date("2026-05-27T12:04:30.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-command-2",
			content: "!rank please show my stats",
			messageCreatedAt: new Date("2026-05-27T12:05:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-pad-bang",
			content: "   !rank please show my stats",
			messageCreatedAt: new Date("2026-05-27T12:05:30.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-url",
			content: "https://example.com/somewhere",
			messageCreatedAt: new Date("2026-05-27T12:06:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-pad-url",
			content: "   https://example.com/somewhere   ",
			messageCreatedAt: new Date("2026-05-27T12:06:30.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-everyone",
			content: "This message calls @everyone into the room.",
			messageCreatedAt: new Date("2026-05-27T12:07:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-mentions",
			content:
				"This message calls <@100000000000000001> <@100000000000000002> <@100000000000000003> <@100000000000000004> <@100000000000000005> into the room.",
			messageCreatedAt: new Date("2026-05-27T12:07:30.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-valid-1",
			content: "First thoughtful user message for training.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});

		const messages = await getEligibleUserTrainingMessages({
			guildId: GUILD_ID,
			userId: USER_A,
			afterMessageCreatedAt: null,
			limit: 10,
		});

		expect(messages.map((message) => message.messageId)).toEqual(["pt-user-valid-1", "pt-user-valid-2"]);
		expect(messages.map((message) => message.content)).toEqual([
			"First thoughtful user message for training.",
			"Second thoughtful user message for training.",
		]);
	});

	it("returns latest edited content and excludes deleted archived messages", async () => {
		await archiveMessage({
			messageId: "pt-user-edited",
			content: "Original archived content that should be replaced.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-edited",
			content: "Latest edited archived content for training.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-user-deleted",
			content: "This otherwise valid message should be deleted.",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});
		await markArchivedChannelMessageDeleted("pt-user-deleted", new Date("2026-05-27T12:03:00.000Z"));

		const messages = await getEligibleUserTrainingMessages({
			guildId: GUILD_ID,
			userId: USER_A,
			afterMessageCreatedAt: null,
			limit: 10,
		});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			messageId: "pt-user-edited",
			content: "Latest edited archived content for training.",
		});
	});

	it("reports missing archive rows as not deleted", async () => {
		await expect(isArchivedChannelMessageDeleted("pt-missing-row")).resolves.toBe(false);
	});

	it("excludes backfilled archive rows that are numeric emoji-only or URL-dominated", async () => {
		await archiveMessage({
			messageId: "pt-m-valid",
			content: "Meaningful archived message with enough alphabetic context.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-m-num",
			content: "12345678901234567890 9876543210",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-m-emoji",
			content: "😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀",
			messageCreatedAt: new Date("2026-05-27T12:03:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-m-url",
			content: "look https://example.com/this/url/makes/the/raw/message/long",
			messageCreatedAt: new Date("2026-05-27T12:04:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-m-alpha",
			content: "abcd 12345678901234567890",
			messageCreatedAt: new Date("2026-05-27T12:05:00.000Z"),
		});

		const messages = await getEligibleUserTrainingMessages({
			guildId: GUILD_ID,
			userId: USER_A,
			afterMessageCreatedAt: null,
			limit: 10,
		});

		expect(messages.map((message) => message.messageId)).toEqual(["pt-m-valid"]);
	});

	it("excludes edited archive rows when the latest content is no longer meaningful", async () => {
		await archiveMessage({
			messageId: "pt-edit-invalid",
			content: "Original meaningful message that would train before edit.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-edit-invalid",
			content: "12345678901234567890",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-edit-valid",
			content: "Another meaningful archived message remains eligible.",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});

		const messages = await getEligibleUserTrainingMessages({
			guildId: GUILD_ID,
			userId: USER_A,
			afterMessageCreatedAt: null,
			limit: 10,
		});

		expect(messages.map((message) => message.messageId)).toEqual(["pt-edit-valid"]);
	});

	it("excludes archived rows outside the Guess Who general channel from personality training", async () => {
		await archiveMessage({
			messageId: "pt-general-user",
			content: "General channel user message for training.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-other-user",
			channelId: NON_GENERAL_CHANNEL_ID,
			content: "Other channel user message should not train.",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-other-guild",
			channelId: NON_GENERAL_CHANNEL_ID,
			authorUserId: USER_B,
			content: "Other channel guild message should not train.",
			messageCreatedAt: new Date("2026-05-27T12:03:00.000Z"),
		});

		const userMessages = await getEligibleUserTrainingMessages({
			guildId: GUILD_ID,
			userId: USER_A,
			afterMessageCreatedAt: null,
			limit: 10,
		});
		const guildWindow = await getEligibleGuildTrainingMessageWindow({
			guildId: GUILD_ID,
			afterMessageCreatedAt: null,
			limit: 10,
		});
		const balancedGuildMessages = await getEligibleGuildTrainingMessages({
			guildId: GUILD_ID,
			afterMessageCreatedAt: null,
			limit: 10,
			maxPerAuthor: 10,
		});

		expect(userMessages.map((message) => message.messageId)).toEqual(["pt-general-user"]);
		expect(guildWindow.map((message) => message.messageId)).toEqual(["pt-general-user"]);
		expect(balancedGuildMessages.map((message) => message.messageId)).toEqual(["pt-general-user"]);
	});

	it("uses message id as an optional cursor tiebreaker for same-timestamp rows", async () => {
		const messageCreatedAt = new Date("2026-05-27T12:01:00.000Z");
		await archiveMessage({
			messageId: "pt-cursor-a",
			content: "Cursor test training message number one.",
			messageCreatedAt,
		});
		await archiveMessage({
			messageId: "pt-cursor-b",
			content: "Cursor test training message number two.",
			messageCreatedAt,
		});

		const messages = await getEligibleUserTrainingMessages({
			guildId: GUILD_ID,
			userId: USER_A,
			afterMessageCreatedAt: messageCreatedAt,
			afterMessageId: "pt-cursor-a",
			limit: 10,
		});

		expect(messages.map((message) => message.messageId)).toEqual(["pt-cursor-b"]);
	});

	it("caps guild training messages per author while including other authors", async () => {
		await archiveMessage({
			messageId: "pt-guild-a-1",
			authorUserId: USER_A,
			content: "Author A training message number one.",
			messageCreatedAt: new Date("2026-05-27T12:01:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-guild-a-2",
			authorUserId: USER_A,
			content: "Author A training message number two.",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-guild-a-3",
			authorUserId: USER_A,
			content: "Author A training message number three.",
			messageCreatedAt: new Date("2026-05-27T12:03:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-guild-b-1",
			authorUserId: USER_B,
			content: "Author B training message number one.",
			messageCreatedAt: new Date("2026-05-27T12:04:00.000Z"),
		});

		const messages = await getEligibleGuildTrainingMessages({
			guildId: GUILD_ID,
			afterMessageCreatedAt: null,
			limit: 4,
			maxPerAuthor: 2,
		});

		expect(messages.map((message) => message.messageId)).toEqual(["pt-guild-a-1", "pt-guild-a-2", "pt-guild-b-1"]);
		expect(messages.filter((message) => message.authorUserId === USER_A)).toHaveLength(2);
		expect(messages.filter((message) => message.authorUserId === USER_B)).toHaveLength(1);
	});

	it("does not starve later authors when early guild rows are dominated by one capped author", async () => {
		const start = new Date("2026-05-27T12:00:00.000Z");
		for (let index = 0; index < 81; index++) {
			await archiveMessage({
				messageId: `pt-a-${String(index).padStart(2, "0")}`,
				authorUserId: USER_A,
				content: `Author A dominant training message ${index}.`,
				messageCreatedAt: new Date(start.getTime() + index * 1000),
			});
		}
		await archiveMessage({
			messageId: "pt-b-late-1",
			authorUserId: USER_B,
			content: "Author B later training message number one.",
			messageCreatedAt: new Date("2026-05-27T12:02:00.000Z"),
		});
		await archiveMessage({
			messageId: "pt-b-late-2",
			authorUserId: USER_B,
			content: "Author B later training message number two.",
			messageCreatedAt: new Date("2026-05-27T12:02:01.000Z"),
		});

		const messages = await getEligibleGuildTrainingMessages({
			guildId: GUILD_ID,
			afterMessageCreatedAt: null,
			limit: 4,
			maxPerAuthor: 2,
		});

		expect(messages.map((message) => message.messageId)).toEqual(["pt-a-00", "pt-a-01", "pt-b-late-1", "pt-b-late-2"]);
	});
});
