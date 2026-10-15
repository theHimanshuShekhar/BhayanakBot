import { container } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import {
	getPendingReminders,
	markReminderFailed,
	markReminderSent,
	type Reminder,
	scheduleReminderRetry,
} from "../db/queries/reminders.js";
import { notifyOnly } from "../lib/allowedMentions.js";
import type { TaskDefinition } from "./scheduler.js";

/** An undeliverable reminder is retried for this long after it was due, then marked failed. */
export const REMINDER_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETRY_BASE_DELAY_MS = 60_000;
const RETRY_MAX_DELAY_MS = 60 * 60 * 1000;

/** Delay before the next attempt once `attempts` deliveries have failed: 1m, 2m, 4m, ... capped at 1h. */
export function reminderRetryDelayMs(attempts: number): number {
	return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1), RETRY_MAX_DELAY_MS);
}

function reminderEmbed(reminder: Reminder): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle("⏰ Reminder")
		.setDescription(reminder.message)
		.setColor(0x5865f2)
		.setFooter({ text: `Set ${reminder.createdAt.toUTCString()}` });
}

async function sendToChannel(reminder: Reminder): Promise<boolean> {
	try {
		const channel = await container.client.channels.fetch(reminder.channelId);
		if (!channel || !("send" in channel)) return false;
		await channel.send({
			content: `<@${reminder.userId}>`,
			embeds: [reminderEmbed(reminder)],
			allowedMentions: notifyOnly([reminder.userId]),
		});
		return true;
	} catch {
		return false;
	}
}

async function sendByDm(reminder: Reminder): Promise<boolean> {
	try {
		const user = await container.client.users.fetch(reminder.userId);
		await user.send({
			content: `I couldn't post your reminder in <#${reminder.channelId}>, so here it is.`,
			embeds: [reminderEmbed(reminder)],
		});
		return true;
	} catch {
		return false;
	}
}

export const sendReminders: TaskDefinition = {
	name: "sendReminders",
	intervalMs: 30_000,
	runOnStartup: true,
	async run() {
		const due = await getPendingReminders();

		for (const reminder of due) {
			try {
				if ((await sendToChannel(reminder)) || (await sendByDm(reminder))) {
					await markReminderSent(reminder.id);
					continue;
				}

				const attempts = reminder.attempts + 1;
				const now = Date.now();
				if (now - reminder.remindAt.getTime() >= REMINDER_RETRY_WINDOW_MS) {
					await markReminderFailed(reminder.id, attempts);
					container.logger.error(
						`[SendReminders] Giving up on reminder #${reminder.id} for user ${reminder.userId}: undeliverable after ${attempts} attempts`,
					);
				} else {
					await scheduleReminderRetry(reminder.id, attempts, new Date(now + reminderRetryDelayMs(attempts)));
				}
			} catch (error) {
				container.logger.error(`[SendReminders] Failed to process reminder #${reminder.id}:`, error);
			}
		}
	},
};
