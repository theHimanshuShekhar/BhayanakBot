import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { getExpiredActiveCases, deactivateCase, createCase } from "../db/queries/modCases.js";
import { db } from "../lib/database.js";
import { guildSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

export class ExpireMutesTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "expireMutes" });
	}

	public async run(): Promise<void> {
		const expired = await getExpiredActiveCases("mute");

		for (const modCase of expired) {
			try {
				const guild = await this.container.client.guilds.fetch(modCase.guildId).catch(() => null);
				if (!guild) {
					await deactivateCase(modCase.id);
					continue;
				}

				const settings = await db.query.guildSettings.findFirst({
					where: eq(guildSettings.guildId, modCase.guildId),
				});

				if (settings?.mutedRoleId) {
					const member = await guild.members.fetch(modCase.userId).catch(() => null);
					if (member) {
						await member.roles.remove(settings.mutedRoleId, "Mute expired").catch(() => null);
					}
				}

				await deactivateCase(modCase.id);

				await createCase({
					guildId: modCase.guildId,
					userId: modCase.userId,
					moderatorId: this.container.client.user!.id,
					type: "unmute",
					reason: "Mute duration expired",
					active: false,
				});
			} catch (error) {
				this.container.logger.error(`[ExpireMutes] Failed to process case #${modCase.id}:`, error);
			}
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		expireMutes: never;
	}
}
