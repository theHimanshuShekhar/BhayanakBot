import { and, eq, lte } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { reminders } from "../schema.js";

export type Reminder = typeof reminders.$inferSelect;

export async function createReminder(data: { userId: string; channelId: string; guildId: string; message: string; remindAt: Date }): Promise<Reminder> {
	const [reminder] = await db.insert(reminders).values(data).returning();
	return reminder;
}

export async function getUserReminders(userId: string, guildId: string): Promise<Reminder[]> {
	return db.query.reminders.findMany({
		where: and(eq(reminders.userId, userId), eq(reminders.guildId, guildId), eq(reminders.sent, false)),
	});
}

export async function cancelReminder(id: number, userId: string): Promise<boolean> {
	const result = await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
	return (result.rowCount ?? 0) > 0;
}

export async function getPendingReminders(): Promise<Reminder[]> {
	return db.query.reminders.findMany({
		where: and(eq(reminders.sent, false), lte(reminders.remindAt, new Date())),
	});
}

export async function markReminderSent(id: number): Promise<void> {
	await db.update(reminders).set({ sent: true }).where(eq(reminders.id, id));
}

export async function getUnsentReminders(): Promise<Reminder[]> {
	return db.query.reminders.findMany({ where: eq(reminders.sent, false) });
}
