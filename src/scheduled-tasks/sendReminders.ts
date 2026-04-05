import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { EmbedBuilder } from "discord.js";
import { getPendingReminders, markReminderSent } from "../db/queries/reminders.js";

export class SendRemindersTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "sendReminders" });
	}

	public async run(): Promise<void> {
		const due = await getPendingReminders();

		for (const reminder of due) {
			try {
				const channel = await this.container.client.channels.fetch(reminder.channelId).catch(() => null);
				if (channel && "send" in channel) {
					const embed = new EmbedBuilder()
						.setTitle("⏰ Reminder")
						.setDescription(reminder.message)
						.setColor(0x5865f2)
						.setFooter({ text: `Set ${reminder.createdAt.toUTCString()}` });

					await (channel as any).send({ content: `<@${reminder.userId}>`, embeds: [embed] }).catch(() => null);
				}
				await markReminderSent(reminder.id);
			} catch (error) {
				this.container.logger.error(`[SendReminders] Failed to send reminder #${reminder.id}:`, error);
			}
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		sendReminders: never;
	}
}
