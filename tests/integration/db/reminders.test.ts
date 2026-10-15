import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createReminder,
	getPendingReminders,
	getUnsentReminders,
	getUserReminders,
	markReminderFailed,
	markReminderSent,
	scheduleReminderRetry,
} from "../../../src/db/queries/reminders.js";
import { reminders } from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";

const USER = "reminder-user-1";
const GUILD = "reminder-guild-1";
const MINUTE = 60_000;

async function seed(remindAt: Date) {
	return createReminder({ userId: USER, channelId: "c1", guildId: GUILD, message: "stretch", remindAt });
}

async function pendingIds(now?: Date): Promise<number[]> {
	return (await getPendingReminders(now)).map((r) => r.id);
}

describe("reminder delivery queries", () => {
	beforeEach(async () => {
		await db.delete(reminders);
	});

	it("returns due reminders and not future ones", async () => {
		const due = await seed(new Date(Date.now() - MINUTE));
		await seed(new Date(Date.now() + 60 * MINUTE));

		expect(await pendingIds()).toEqual([due.id]);
	});

	it("holds a reminder back until its next attempt time", async () => {
		const reminder = await seed(new Date(Date.now() - 10 * MINUTE));
		const nextAttemptAt = new Date(Date.now() + 5 * MINUTE);

		await scheduleReminderRetry(reminder.id, 1, nextAttemptAt);

		expect(await pendingIds()).toEqual([]);
		const later = await getPendingReminders(new Date(nextAttemptAt.getTime() + 1));
		expect(later.map((r) => [r.id, r.attempts])).toEqual([[reminder.id, 1]]);
	});

	it("excludes sent and failed reminders from pending, unsent, and a user's list", async () => {
		const sent = await seed(new Date(Date.now() - MINUTE));
		const failed = await seed(new Date(Date.now() - MINUTE));
		const active = await seed(new Date(Date.now() - MINUTE));
		await markReminderSent(sent.id);
		await markReminderFailed(failed.id, 13);

		expect(await pendingIds()).toEqual([active.id]);
		expect((await getUnsentReminders()).map((r) => r.id)).toEqual([active.id]);
		expect((await getUserReminders(USER, GUILD)).map((r) => r.id)).toEqual([active.id]);
		const stored = await db.query.reminders.findFirst({ where: eq(reminders.id, failed.id) });
		expect(stored).toMatchObject({ failed: true, attempts: 13, nextAttemptAt: null });
	});
});
