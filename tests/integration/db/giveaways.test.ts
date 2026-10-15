import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addEntry,
	createGiveaway,
	endGiveaway,
	getGiveawayByMessage,
	rerollGiveaway,
} from "../../../src/db/queries/giveaways.js";
import { giveaways } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const GUILD = "giveaway-guild-1";
const OTHER_GUILD = "giveaway-guild-2";
const MESSAGE = "9100000000000000001";

async function seed(): Promise<void> {
	await db.delete(giveaways).where(eq(giveaways.messageId, MESSAGE));
	await createGiveaway({
		messageId: MESSAGE,
		channelId: "giveaway-channel",
		guildId: GUILD,
		prize: "Nitro",
		winnerCount: 1,
		endsAt: new Date(Date.now() - 1000),
		hostId: "host",
	});
}

describe("giveaway queries", () => {
	beforeEach(seed);

	it("treats another guild's message ID as not found for lookup and entry", async () => {
		expect(await getGiveawayByMessage(GUILD, MESSAGE)).toBeDefined();
		expect(await getGiveawayByMessage(OTHER_GUILD, MESSAGE)).toBeUndefined();

		expect(await addEntry(OTHER_GUILD, MESSAGE, "intruder")).toBeUndefined();
		expect((await addEntry(GUILD, MESSAGE, "member"))?.entries).toEqual(["member"]);
	});

	it("does not end or change a giveaway from another guild", async () => {
		expect(await endGiveaway(OTHER_GUILD, MESSAGE, ["intruder"])).toBeUndefined();

		const row = await getGiveawayByMessage(GUILD, MESSAGE);
		expect(row?.ended).toBe(false);
		expect(row?.winners).toEqual([]);
	});

	it("ends exactly once when the task and a moderator race", async () => {
		const results = await Promise.all([
			endGiveaway(GUILD, MESSAGE, ["task-winner"]),
			endGiveaway(GUILD, MESSAGE, ["mod-winner"]),
			endGiveaway(GUILD, MESSAGE, ["third-winner"]),
		]);

		const ended = results.filter((r) => r !== undefined);
		expect(ended).toHaveLength(1);
		const row = await getGiveawayByMessage(GUILD, MESSAGE);
		expect(row?.winners).toEqual(ended[0]?.winners);
	});

	it("rerolls only ended giveaways of the guild and accumulates winners", async () => {
		expect(await rerollGiveaway(GUILD, MESSAGE, [], ["early"])).toBeUndefined();

		await endGiveaway(GUILD, MESSAGE, ["first"]);
		expect(await rerollGiveaway(OTHER_GUILD, MESSAGE, ["first"], ["intruder"])).toBeUndefined();

		const rerolled = await rerollGiveaway(GUILD, MESSAGE, ["first"], ["second"]);
		expect(rerolled?.winners).toEqual(["first", "second"]);
	});

	it("applies only one of two concurrent rerolls", async () => {
		await endGiveaway(GUILD, MESSAGE, ["first"]);

		const results = await Promise.all([
			rerollGiveaway(GUILD, MESSAGE, ["first"], ["a"]),
			rerollGiveaway(GUILD, MESSAGE, ["first"], ["b"]),
		]);

		expect(results.filter((r) => r !== undefined)).toHaveLength(1);
		expect((await getGiveawayByMessage(GUILD, MESSAGE))?.winners).toHaveLength(2);
	});
});
