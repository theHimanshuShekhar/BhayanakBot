import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { getUsersNeedingRefresh } from "../db/queries/personality.js";
import { buildPersonalityProfile } from "../lib/personality/buildProfile.js";

export class RefreshPersonalityProfilesTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "refreshPersonalityProfiles" });
	}

	public async run(): Promise<void> {
		const users = await getUsersNeedingRefresh();
		if (users.length === 0) return;

		this.container.logger.info(`[personality] Refreshing profiles for ${users.length} user(s)`);

		// Run sequentially — Ollama is a local instance, parallel calls would overwhelm it
		for (const { userId, guildId } of users) {
			try {
				await buildPersonalityProfile(userId, guildId);
			} catch (err) {
				this.container.logger.error(`[personality] Failed to build profile for userId=${userId} guildId=${guildId}:`, err);
			}
		}
	}
}
