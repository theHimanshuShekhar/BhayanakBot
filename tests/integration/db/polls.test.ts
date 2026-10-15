import { beforeEach, describe, expect, it } from "vitest";
import {
	closePoll,
	createPoll,
	getActiveExpiredPolls,
	getPollByMessage,
	isPollOpen,
	vote,
} from "../../../src/db/queries/polls.js";
import { polls } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const MESSAGE = "9200000000000000001";
const MINUTE = 60_000;

async function seed(expiresAt?: Date) {
	await db.delete(polls);
	return createPoll({
		messageId: MESSAGE,
		channelId: "poll-channel",
		guildId: "poll-guild",
		question: "Best language?",
		options: [
			{ label: "TS", votes: [] },
			{ label: "Go", votes: [] },
		],
		expiresAt,
	});
}

describe("poll voting", () => {
	beforeEach(() => db.delete(polls).then(() => undefined));

	it("records votes on an open poll, moving a voter's earlier vote", async () => {
		await seed(new Date(Date.now() + 10 * MINUTE));

		await vote(MESSAGE, 0, "u1");
		const updated = await vote(MESSAGE, 1, "u1");

		expect(updated?.options).toEqual([
			{ label: "TS", votes: [] },
			{ label: "Go", votes: ["u1"] },
		]);
	});

	it("takes votes on a poll with no expiry", async () => {
		await seed();

		expect(await vote(MESSAGE, 0, "u1")).toBeDefined();
	});

	it("refuses a vote once the poll has expired, even though the closing task has not run", async () => {
		await seed(new Date(Date.now() - MINUTE));
		expect((await getPollByMessage(MESSAGE))?.closed).toBe(false);

		expect(await vote(MESSAGE, 0, "late-voter")).toBeUndefined();

		const stored = await getPollByMessage(MESSAGE);
		expect((stored?.options as Array<{ votes: string[] }>).flatMap((o) => o.votes)).toEqual([]);
	});

	it("refuses a vote on a closed poll", async () => {
		await seed(new Date(Date.now() + 10 * MINUTE));
		await closePoll(MESSAGE);

		expect(await vote(MESSAGE, 0, "u1")).toBeUndefined();
	});

	it("keeps an expired poll listed for the closing task until it is closed", async () => {
		await seed(new Date(Date.now() - MINUTE));
		expect((await getActiveExpiredPolls()).map((p) => p.messageId)).toEqual([MESSAGE]);

		await closePoll(MESSAGE);

		expect(await getActiveExpiredPolls()).toEqual([]);
	});
});

describe("isPollOpen", () => {
	const now = new Date("2026-10-15T12:00:00Z");

	it("is closed once closed or expired, and open otherwise", () => {
		expect(isPollOpen({ closed: false, expiresAt: null }, now)).toBe(true);
		expect(isPollOpen({ closed: false, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true);
		expect(isPollOpen({ closed: false, expiresAt: now }, now)).toBe(false);
		expect(isPollOpen({ closed: true, expiresAt: null }, now)).toBe(false);
	});
});
