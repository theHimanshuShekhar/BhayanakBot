import { container } from "@sapphire/framework";
import { getDashboardPresenceIntervalMs, writeDashboardPresenceSnapshotForClient } from "../lib/dashboardPresence.js";
import type { TaskDefinition } from "./scheduler.js";
import { waitForClientReady } from "./waitForClientReady.js";

export function createDashboardPresence(): TaskDefinition {
	return {
		name: "dashboardPresence",
		intervalMs: getDashboardPresenceIntervalMs({
			DASHBOARD_PRESENCE_INTERVAL_MS: process.env.DASHBOARD_PRESENCE_INTERVAL_MS,
		}),
		runOnStartup: true,
		async run() {
			await waitForClientReady(container.client);
			await writeDashboardPresenceSnapshotForClient(container.client);
			container.logger.info("[dashboard-presence] Snapshot written");
		},
	};
}
