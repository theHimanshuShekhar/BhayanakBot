import { container } from "@sapphire/framework";
import { getUsersNeedingRefresh } from "../db/queries/personality.js";
import { buildPersonalityProfile } from "../lib/personality/buildProfile.js";
import type { TaskDefinition } from "./scheduler.js";

export const refreshPersonalityProfiles: TaskDefinition = {
	name: "refreshPersonalityProfiles",
	intervalMs: 6 * 60 * 60 * 1000,
	runOnStartup: true,
	async run() {
		const startedAt = Date.now();
		container.logger.debug("[personality-refresh] task start");
		const users = await getUsersNeedingRefresh();
		container.logger.debug(`[personality-refresh] candidates count=${users.length}`);
		if (users.length === 0) {
			container.logger.debug(`[personality-refresh] task complete count=0 durationMs=${Date.now() - startedAt}`);
			return;
		}

		container.logger.info(`[personality] Refreshing profiles for ${users.length} user(s)`);

		// Run sequentially — one profile build (one LLM call) at a time
		let built = 0;
		let skipped = 0;
		let failed = 0;
		for (const { userId, guildId } of users) {
			try {
				container.logger.debug(`[personality-refresh] build start userId=${userId} guildId=${guildId}`);
				const result = await buildPersonalityProfile(userId, guildId);
				if (result.status === "built") built++;
				else skipped++;
				container.logger.debug(
					`[personality-refresh] build result userId=${userId} guildId=${guildId} status=${result.status}`,
				);
			} catch (err) {
				failed++;
				container.logger.error(`[personality] Failed to build profile for userId=${userId} guildId=${guildId}:`, err);
			}
		}
		container.logger.debug(
			`[personality-refresh] task complete candidates=${users.length} built=${built} skipped=${skipped} failed=${failed} durationMs=${Date.now() - startedAt}`,
		);
	},
};
