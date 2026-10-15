import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addEntry,
	createGiveaway,
	endGiveaway,
	getGiveawayByMessage,
	getGiveawaysAwaitingAnnouncement,
	markGiveawayAnnounced,
	recordGiveawayAnnounceFailure,
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

	describe("announcement delivery", () => {
		const longAgo = () => new Date(Date.now() - 10 * 60_000);
		const awaiting = async (attemptedBefore = new Date()) =>
			(await getGiveawaysAwaitingAnnouncement(attemptedBefore)).filter((g) => g.messageId === MESSAGE);

		it("is awaiting announcement once ended, but not before", async () => {
			expect(await awaiting()).toEqual([]);

			await endGiveaway(GUILD, MESSAGE, ["first"]);

			expect(await awaiting()).toHaveLength(1);
		});

		it("waits out the retry delay after ending and after every failed attempt", async () => {
			await endGiveaway(GUILD, MESSAGE, ["first"]);
			expect(await awaiting(longAgo())).toEqual([]);

			await recordGiveawayAnnounceFailure((await getGiveawayByMessage(GUILD, MESSAGE))!.id);

			const row = await getGiveawayByMessage(GUILD, MESSAGE);
			expect(row?.announceAttempts).toBe(1);
			expect(await awaiting(longAgo())).toEqual([]);
			expect(await awaiting(new Date(Date.now() + 1000))).toHaveLength(1);
		});

		it("is no longer awaiting once announced", async () => {
			await endGiveaway(GUILD, MESSAGE, ["first"]);
			await markGiveawayAnnounced((await getGiveawayByMessage(GUILD, MESSAGE))!.id);

			expect(await awaiting(new Date(Date.now() + 1000))).toEqual([]);
		});
	});
});
