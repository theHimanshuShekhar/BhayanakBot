import { container } from "@sapphire/framework";
import { getPublicStatsIntervalMs, writePublicBotStatsSnapshotForClient } from "../lib/publicStats.js";
import type { TaskDefinition } from "./scheduler.js";
import { waitForClientReady } from "./waitForClientReady.js";

export function createPublicStats(): TaskDefinition {
	return {
		name: "publicStats",
		intervalMs: getPublicStatsIntervalMs({ PUBLIC_STATS_INTERVAL_MS: process.env.PUBLIC_STATS_INTERVAL_MS }),
		runOnStartup: true,
		async run() {
			await waitForClientReady(container.client);
			await writePublicBotStatsSnapshotForClient(container.client);
			container.logger.info("[public-stats] Snapshot written");
		},
	};
}
