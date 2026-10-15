import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { getUnsentReminders } from "../db/queries/reminders.js";
import { giveaways, modCases, polls } from "../db/schema.js";
import { db } from "../lib/database.js";
import type { TaskDefinition } from "./scheduler.js";

/**
 * Runs once on bot startup (no interval) to log any active scheduled items
 * that may have been missed during downtime.
 *
 * The expireMutes, expireTempBans, sendReminders, endGiveaways, and endPolls
 * tasks are all pollers (they scan the DB every interval), so nothing needs
 * re-queuing on restart.
 */
export const reloadOnRestart: TaskDefinition = {
	name: "reloadOnRestart",
	runOnStartup: true,
	async run() {
		container.logger.info("[ReloadOnRestart] Checking for pending work after restart...");

		const [unsentReminders, activeGiveaways, activePolls, expiredMutes, expiredBans] = await Promise.all([
			getUnsentReminders(),
			db.query.giveaways.findMany({ where: eq(giveaways.ended, false) }),
			db.query.polls.findMany({ where: eq(polls.closed, false) }),
			db.query.modCases.findMany({ where: and(eq(modCases.type, "mute"), eq(modCases.active, true)) }),
			db.query.modCases.findMany({ where: and(eq(modCases.type, "tempban"), eq(modCases.active, true)) }),
		]);

		container.logger.info(
			`[ReloadOnRestart] Found: ${unsentReminders.length} reminders, ` +
				`${activeGiveaways.length} giveaways, ${activePolls.length} polls, ` +
				`${expiredMutes.length} mutes, ${expiredBans.length} tempbans`,
		);

		// The polling tasks run on intervals and will pick these up automatically.
		// No explicit re-queuing needed — just log the state for visibility.
	},
};
