import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { reminders } from "../schema.js";

export type Reminder = typeof reminders.$inferSelect;

export async function createReminder(data: {
	userId: string;
	channelId: string;
	guildId: string;
	message: string;
	remindAt: Date;
}): Promise<Reminder> {
	const [reminder] = await db.insert(reminders).values(data).returning();
	return reminder;
}

export async function getUserReminders(userId: string, guildId: string): Promise<Reminder[]> {
	return db.query.reminders.findMany({
		where: and(
			eq(reminders.userId, userId),
			eq(reminders.guildId, guildId),
			eq(reminders.sent, false),
			eq(reminders.failed, false),
		),
	});
}

export async function cancelReminder(id: number, userId: string): Promise<boolean> {
	const result = await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
	return (result.rowCount ?? 0) > 0;
}

/** Reminders that are due and not waiting out a retry backoff. Delivered and abandoned reminders are excluded. */
export async function getPendingReminders(now = new Date()): Promise<Reminder[]> {
	return db.query.reminders.findMany({
		where: and(
			eq(reminders.sent, false),
			eq(reminders.failed, false),
			lte(reminders.remindAt, now),
			or(isNull(reminders.nextAttemptAt), lte(reminders.nextAttemptAt, now)),
		),
	});
}

export async function markReminderSent(id: number): Promise<void> {
	await db.update(reminders).set({ sent: true }).where(eq(reminders.id, id));
}

/** Records a failed delivery and holds the reminder back until `nextAttemptAt`. */
export async function scheduleReminderRetry(id: number, attempts: number, nextAttemptAt: Date): Promise<void> {
	await db.update(reminders).set({ attempts, nextAttemptAt }).where(eq(reminders.id, id));
}

/** Gives up on a reminder that could not be delivered anywhere within the retry window. */
export async function markReminderFailed(id: number, attempts: number): Promise<void> {
	await db.update(reminders).set({ failed: true, attempts, nextAttemptAt: null }).where(eq(reminders.id, id));
}

export async function getUnsentReminders(): Promise<Reminder[]> {
	return db.query.reminders.findMany({ where: and(eq(reminders.sent, false), eq(reminders.failed, false)) });
}
