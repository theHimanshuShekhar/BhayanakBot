import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { getUnsentReminders } from "../db/queries/reminders.js";
import { db } from "../lib/database.js";
import { giveaways, polls, modCases } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

/**
 * Runs once on bot startup to re-queue any active scheduled items
 * that may have been missed during downtime.
 *
 * The expireMutes, expireTempBans, sendReminders, endGiveaways, and endPolls
 * tasks are all pollers (they scan the DB every interval), so re-queuing
 * them on restart is simply ensuring the cron-like tasks are running.
 *
 * This task is invoked manually in index.ts after client login.
 */
export class ReloadOnRestartTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "reloadOnRestart" });
	}

	public async run(): Promise<void> {
		this.container.logger.info("[ReloadOnRestart] Checking for pending work after restart...");

		const [unsentReminders, activeGiveaways, activePolls, expiredMutes, expiredBans] = await Promise.all([
			getUnsentReminders(),
			db.query.giveaways.findMany({ where: eq(giveaways.ended, false) }),
			db.query.polls.findMany({ where: eq(polls.closed, false) }),
			db.query.modCases.findMany({ where: and(eq(modCases.type, "mute"), eq(modCases.active, true)) }),
			db.query.modCases.findMany({ where: and(eq(modCases.type, "tempban"), eq(modCases.active, true)) }),
		]);

		this.container.logger.info(
			`[ReloadOnRestart] Found: ${unsentReminders.length} reminders, ` +
			`${activeGiveaways.length} giveaways, ${activePolls.length} polls, ` +
			`${expiredMutes.length} mutes, ${expiredBans.length} tempbans`,
		);

		// The polling tasks run on intervals and will pick these up automatically.
		// No explicit re-queuing needed — just log the state for visibility.
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		reloadOnRestart: never;
	}
}
