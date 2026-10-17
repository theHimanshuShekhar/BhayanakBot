import { createDashboardPresence } from "./dashboardPresence.js";
import { endGiveaways } from "./endGiveaways.js";
import { endPolls } from "./endPolls.js";
import { expireMutes } from "./expireMutes.js";
import { expireTempBans } from "./expireTempBans.js";
import { createPublicStats } from "./publicStats.js";
import { refreshPersonalityProfiles } from "./refreshPersonalityProfiles.js";
import { reloadOnRestart } from "./reloadOnRestart.js";
import type { TaskDefinition } from "./scheduler.js";
import { sendReminders } from "./sendReminders.js";
import { createSyncMinecraftTracker } from "./syncMinecraftTracker.js";
import { createSyncPalworldTracker } from "./syncPalworldTracker.js";

/** Every background task the bot runs. Built per call: the trackers hold state, the publishers read env. */
export function getTasks(): TaskDefinition[] {
	return [
		expireMutes,
		expireTempBans,
		sendReminders,
		endGiveaways,
		endPolls,
		reloadOnRestart,
		createSyncPalworldTracker(),
		createSyncMinecraftTracker(),
		createPublicStats(),
		createDashboardPresence(),
		refreshPersonalityProfiles,
	];
}
