import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	markArchivedChannelMessagesDeleted,
	PENDING_DELETE_MAX_ENTRIES,
	PENDING_DELETE_TTL_MS,
	pendingDeletedMessages,
	upsertArchivedChannelMessage,
} from "../../../src/db/queries/archivedChannelMessages.js";
import { archivedChannelMessages } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const GUILD_ID = "pd-guild";
const CHANNEL_ID = "pd-channel";

function archiveInput(messageId: string) {
	return {
		messageId,
		guildId: GUILD_ID,
		channelId: CHANNEL_ID,
		authorUserId: "pd-user",
		authorUsername: "user",
		authorDisplayName: "User",
		content: "Some archived content that is long enough",
		messageCreatedAt: new Date(),
	};
}

describe("pending deletion tracking", () => {
	beforeEach(async () => {
		pendingDeletedMessages.clear();
		await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	});

	afterEach(async () => {
		vi.useRealTimers();
		await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	});

	it("still marks a message archived after its delete event arrived first", async () => {
		await markArchivedChannelMessagesDeleted(["pd-early"]);

		const result = await upsertArchivedChannelMessage(archiveInput("pd-early"));

		expect(result.deleted).toBe(true);
		expect(pendingDeletedMessages.has("pd-early")).toBe(false);
	});

	it("forgets a pending deletion once it is older than the ttl", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		await markArchivedChannelMessagesDeleted(["pd-stale"]);
		vi.advanceTimersByTime(PENDING_DELETE_TTL_MS + 1000);

		await markArchivedChannelMessagesDeleted(["pd-fresh"]);

		expect(pendingDeletedMessages.has("pd-stale")).toBe(false);
		expect(pendingDeletedMessages.has("pd-fresh")).toBe(true);
		const result = await upsertArchivedChannelMessage(archiveInput("pd-stale"));
		expect(result.deleted).toBe(false);
	});

	it("caps the number of tracked deletions", async () => {
		const ids = Array.from({ length: PENDING_DELETE_MAX_ENTRIES + 100 }, (_, i) => `pd-cap-${i}`);

		for (let i = 0; i < ids.length; i += 500) await markArchivedChannelMessagesDeleted(ids.slice(i, i + 500));

		expect(pendingDeletedMessages.size).toBe(PENDING_DELETE_MAX_ENTRIES);
		expect(pendingDeletedMessages.has("pd-cap-0")).toBe(false);
		expect(pendingDeletedMessages.has(ids[ids.length - 1] as string)).toBe(true);
	});
});
