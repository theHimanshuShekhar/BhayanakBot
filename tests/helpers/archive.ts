import type { ArchivedMessageInput } from "../../src/db/queries/archivedChannelMessages.js";
import { archivedChannelMessages } from "../../src/db/schema.js";
import { db } from "../../src/lib/database.js";

/**
 * Seeds archived messages with one INSERT. Looping upsertArchivedChannelMessage costs several
 * round trips per row, which is slow enough under CPU load to blow the default test timeout
 * when a test needs the 100/200 message training thresholds.
 */
export async function seedArchivedMessages(messages: ArchivedMessageInput[]): Promise<void> {
	if (messages.length === 0) return;
	await db
		.insert(archivedChannelMessages)
		.values(messages.map((message) => ({ ...message, updatedAt: new Date() })))
		.onConflictDoNothing();
}
