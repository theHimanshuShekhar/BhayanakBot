import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getRandomGuessWhoMessage,
	isArchivedChannelMessageDeleted,
	markArchivedChannelMessageDeleted,
	markArchivedChannelMessagesDeleted,
	upsertArchivedChannelMessage,
} from "../../../src/db/queries/archivedChannelMessages.js";
import { getEligibleGuildTrainingMessages } from "../../../src/db/queries/personalityTraining.js";
import { archivedChannelMessages } from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "guild-gw-archive";
const CHANNEL_ID = GUESS_WHO_CHANNEL_ID;
const PLAYER_ID = "player-1";
const OLD = new Date("2026-05-27T12:00:00.000Z");

async function archive(messageId: string, content: string, messageCreatedAt: Date, authorUserId = "author-1") {
	await upsertArchivedChannelMessage({
		messageId,
		guildId: GUILD_ID,
		channelId: CHANNEL_ID,
		authorUserId,
		authorUsername: authorUserId,
		authorDisplayName: authorUserId,
		content,
		messageCreatedAt,
	});
}

const pick = (excludeMessageIds?: string[]) =>
	getRandomGuessWhoMessage({
		guildId: GUILD_ID,
		channelId: CHANNEL_ID,
		excludeAuthorUserId: PLAYER_ID,
		excludeMessageIds,
	});

describe("guess who archive", () => {
	beforeEach(async () => {
		await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("bulk deletes", () => {
		it("marks every archived message in a bulk delete as deleted", async () => {
			await archive("gw-bulk-1", "A message that will be purged.", OLD);
			await archive("gw-bulk-2", "Another message that will be purged.", OLD);
			await archive("gw-bulk-keep", "A message that survives the purge.", OLD);

			await markArchivedChannelMessagesDeleted(["gw-bulk-1", "gw-bulk-2"]);

			expect(await isArchivedChannelMessageDeleted("gw-bulk-1")).toBe(true);
			expect(await isArchivedChannelMessageDeleted("gw-bulk-2")).toBe(true);
			expect(await isArchivedChannelMessageDeleted("gw-bulk-keep")).toBe(false);
		});

		it("purged messages are excluded from future rounds and training", async () => {
			await archive("gw-purged", "A thoughtful message that gets purged.", OLD);
			await archive("gw-kept", "A thoughtful message that is kept around.", OLD);

			await markArchivedChannelMessagesDeleted(["gw-purged"]);

			vi.spyOn(Math, "random").mockReturnValue(0);
			expect((await pick())?.messageId).toBe("gw-kept");
			const training = await getEligibleGuildTrainingMessages({
				guildId: GUILD_ID,
				afterMessageCreatedAt: null,
				limit: 50,
				maxPerAuthor: 50,
			});
			expect(training.map((m) => m.messageId)).toEqual(["gw-kept"]);
		});

		it("a purge that arrives before the message is archived still marks it deleted", async () => {
			await markArchivedChannelMessagesDeleted(["gw-bulk-early"]);
			await archive("gw-bulk-early", "Archived after the purge was already seen.", OLD);

			expect(await isArchivedChannelMessageDeleted("gw-bulk-early")).toBe(true);
		});
	});

	describe("random selection", () => {
		it("is ordered by message time so a given draw is reproducible", async () => {
			// Inserted out of chronological order on purpose.
			await archive("gw-order-c", "The newest eligible archived message.", new Date("2026-05-27T12:03:00.000Z"));
			await archive("gw-order-a", "The oldest eligible archived message.", new Date("2026-05-27T12:01:00.000Z"));
			await archive("gw-order-b", "The middle eligible archived message.", new Date("2026-05-27T12:02:00.000Z"));

			vi.spyOn(Math, "random").mockReturnValue(0);
			expect((await pick())?.messageId).toBe("gw-order-a");
			vi.spyOn(Math, "random").mockReturnValue(0.5);
			expect((await pick())?.messageId).toBe("gw-order-b");
			vi.spyOn(Math, "random").mockReturnValue(0.99);
			expect((await pick())?.messageId).toBe("gw-order-c");
		});

		it("never returns a row the game rules reject, even if the draw lands on one", async () => {
			// Padded with non-breaking spaces: JS trims them to 5 characters, so the game rules reject it.
			await archive("gw-ineligible", `${" ".repeat(10)}short`, OLD);
			await archive("gw-good", "A perfectly fine eligible message.", new Date(OLD.getTime() + 60_000));

			vi.spyOn(Math, "random").mockReturnValue(0);
			expect((await pick())?.messageId).toBe("gw-good");
		});

		it("skips excluded message ids", async () => {
			await archive("gw-ex-a", "The first eligible archived message.", new Date("2026-05-27T12:01:00.000Z"));
			await archive("gw-ex-b", "The second eligible archived message.", new Date("2026-05-27T12:02:00.000Z"));

			vi.spyOn(Math, "random").mockReturnValue(0);
			expect((await pick(["gw-ex-a"]))?.messageId).toBe("gw-ex-b");
			expect(await pick(["gw-ex-a", "gw-ex-b"])).toBeNull();
		});

		it("returns null when nothing is eligible", async () => {
			expect(await pick()).toBeNull();
		});
	});

	it("single delete still marks the message deleted", async () => {
		await archive("gw-single", "A message deleted on its own.", OLD);
		await markArchivedChannelMessageDeleted("gw-single");
		expect(await isArchivedChannelMessageDeleted("gw-single")).toBe(true);
	});
});
