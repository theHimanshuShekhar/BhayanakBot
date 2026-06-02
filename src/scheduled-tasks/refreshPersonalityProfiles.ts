import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { getUsersNeedingRefresh } from "../db/queries/personality.js";
import { buildPersonalityProfile } from "../lib/personality/buildProfile.js";

export class RefreshPersonalityProfilesTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "refreshPersonalityProfiles" });
	}

	public async run(): Promise<void> {
		const startedAt = Date.now();
		this.container.logger.debug("[personality-refresh] task start");
		const users = await getUsersNeedingRefresh();
		this.container.logger.debug(`[personality-refresh] candidates count=${users.length}`);
		if (users.length === 0) {
			this.container.logger.debug(`[personality-refresh] task complete count=0 durationMs=${Date.now() - startedAt}`);
			return;
		}

		this.container.logger.info(`[personality] Refreshing profiles for ${users.length} user(s)`);

		// Run sequentially — Ollama is a local instance, parallel calls would overwhelm it
		let built = 0;
		let skipped = 0;
		let failed = 0;
		for (const { userId, guildId } of users) {
			try {
				this.container.logger.debug(`[personality-refresh] build start userId=${userId} guildId=${guildId}`);
				const result = await buildPersonalityProfile(userId, guildId);
				if (result.status === "built") built++;
				else skipped++;
				this.container.logger.debug(
					`[personality-refresh] build result userId=${userId} guildId=${guildId} status=${result.status}`,
				);
			} catch (err) {
				failed++;
				this.container.logger.error(
					`[personality] Failed to build profile for userId=${userId} guildId=${guildId}:`,
					err,
				);
			}
		}
		this.container.logger.debug(
			`[personality-refresh] task complete candidates=${users.length} built=${built} skipped=${skipped} failed=${failed} durationMs=${Date.now() - startedAt}`,
		);
	}
}
