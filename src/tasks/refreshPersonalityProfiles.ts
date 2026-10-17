import { container } from "@sapphire/framework";
import { getGuildsDueForPersonalityBuild, getUsersDueForPersonalityBuild } from "../db/queries/personalityTraining.js";
import {
	buildGuildPersonalityProfile,
	INITIAL_GUILD_PROFILE_THRESHOLD,
	REFRESH_GUILD_PROFILE_THRESHOLD,
} from "../lib/personality/buildGuildProfile.js";
import {
	buildPersonalityProfile,
	INITIAL_USER_PROFILE_THRESHOLD,
	REFRESH_USER_PROFILE_THRESHOLD,
} from "../lib/personality/buildProfile.js";
import type { PersonalityBuildResult } from "../lib/personality/profileBuilder.js";
import type { TaskDefinition } from "./scheduler.js";

interface BuildCounts {
	built: number;
	skipped: number;
	failed: number;
}

/** Runs the builds one at a time (one LLM call at a time); a failed build is logged and never stops the rest. */
async function runBuilds<T>(
	due: T[],
	describe: (item: T) => string,
	build: (item: T) => Promise<PersonalityBuildResult>,
): Promise<BuildCounts> {
	const counts: BuildCounts = { built: 0, skipped: 0, failed: 0 };
	for (const item of due) {
		try {
			const result = await build(item);
			if (result.status === "built") counts.built++;
			else counts.skipped++;
			container.logger.debug(`[personality-refresh] ${describe(item)} status=${result.status}`);
		} catch (err) {
			counts.failed++;
			container.logger.error(`[personality-refresh] build failed ${describe(item)}:`, err);
		}
	}
	return counts;
}

/**
 * The only automatic builder of personality profiles. Builds or refreshes every server and member profile whose
 * eligible archive messages after the cursor meet the threshold, in guilds with personality features on.
 */
export const refreshPersonalityProfiles: TaskDefinition = {
	name: "refreshPersonalityProfiles",
	intervalMs: 6 * 60 * 60 * 1000,
	runOnStartup: true,
	async run() {
		const startedAt = Date.now();
		const [guilds, users] = await Promise.all([
			getGuildsDueForPersonalityBuild({
				initial: INITIAL_GUILD_PROFILE_THRESHOLD,
				refresh: REFRESH_GUILD_PROFILE_THRESHOLD,
			}),
			getUsersDueForPersonalityBuild({
				initial: INITIAL_USER_PROFILE_THRESHOLD,
				refresh: REFRESH_USER_PROFILE_THRESHOLD,
			}),
		]);
		if (guilds.length === 0 && users.length === 0) {
			container.logger.debug("[personality-refresh] nothing due");
			return;
		}

		container.logger.info(`[personality] ${guilds.length} server profile(s) and ${users.length} member profile(s) due`);
		const guildCounts = await runBuilds(
			guilds,
			(guildId) => `guildId=${guildId}`,
			(guildId) => buildGuildPersonalityProfile(guildId),
		);
		const userCounts = await runBuilds(
			users,
			({ userId, guildId }) => `userId=${userId} guildId=${guildId}`,
			({ userId, guildId }) => buildPersonalityProfile(userId, guildId),
		);
		container.logger.info(
			`[personality] scheduled builds done: servers built=${guildCounts.built} skipped=${guildCounts.skipped} failed=${guildCounts.failed}; members built=${userCounts.built} skipped=${userCounts.skipped} failed=${userCounts.failed}; durationMs=${Date.now() - startedAt}`,
		);
	},
};
