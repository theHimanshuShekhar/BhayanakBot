import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { createCase, deactivateCase, getExpiredActiveCases } from "../db/queries/modCases.js";

export class ExpireTempBansTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "expireTempBans" });
	}

	public async run(): Promise<void> {
		const expired = await getExpiredActiveCases("tempban");

		for (const modCase of expired) {
			try {
				const guild = await this.container.client.guilds.fetch(modCase.guildId).catch(() => null);
				if (!guild) {
					await deactivateCase(modCase.id);
					continue;
				}

				const unbanned = await guild.members
					.unban(modCase.userId, "Temporary ban expired")
					.then(() => true)
					.catch(() => false);
				if (!unbanned) {
					this.container.logger.warn(
						`[ExpireTempBans] Failed to unban ${modCase.userId} in ${modCase.guildId} — will retry`,
					);
					continue;
				}

				await deactivateCase(modCase.id);

				await createCase({
					guildId: modCase.guildId,
					userId: modCase.userId,
					moderatorId: this.container.client.user!.id,
					type: "unban",
					reason: "Temporary ban expired",
					active: false,
				});
			} catch (error) {
				this.container.logger.error(`[ExpireTempBans] Failed to process case #${modCase.id}:`, error);
			}
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		expireTempBans: never;
	}
}
