import { container } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getPendingReminders, markReminderSent } from "../db/queries/reminders.js";
import { notifyOnly } from "../lib/allowedMentions.js";
import type { TaskDefinition } from "./scheduler.js";

export const sendReminders: TaskDefinition = {
	name: "sendReminders",
	intervalMs: 30_000,
	runOnStartup: true,
	async run() {
		const due = await getPendingReminders();

		for (const reminder of due) {
			try {
				const channel = await container.client.channels.fetch(reminder.channelId).catch(() => null);
				if (channel && "send" in channel) {
					const embed = new EmbedBuilder()
						.setTitle("⏰ Reminder")
						.setDescription(reminder.message)
						.setColor(0x5865f2)
						.setFooter({ text: `Set ${reminder.createdAt.toUTCString()}` });

					await (channel as any)
						.send({ content: `<@${reminder.userId}>`, embeds: [embed], allowedMentions: notifyOnly([reminder.userId]) })
						.catch(() => null);
				}
				await markReminderSent(reminder.id);
			} catch (error) {
				container.logger.error(`[SendReminders] Failed to send reminder #${reminder.id}:`, error);
			}
		}
	},
};
