import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { DiscordAPIError, type Guild } from "discord.js";
import { endGiveaway, getActiveExpiredGiveaways } from "../db/queries/giveaways.js";
import { endAndAnnounceGiveaway } from "../lib/giveaways.js";

export class EndGiveawaysTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "endGiveaways" });
	}

	public async run(): Promise<void> {
		const expired = await getActiveExpiredGiveaways();

		for (const giveaway of expired) {
			try {
				const guild = await this.fetchGuild(giveaway.guildId);
				if (!guild) {
					// The bot is no longer in the guild: nobody to draw from or announce to, so just close it.
					await endGiveaway(giveaway.guildId, giveaway.messageId, []);
					continue;
				}
				await endAndAnnounceGiveaway(guild, giveaway);
			} catch (error) {
				this.container.logger.error(`[EndGiveaways] Failed to end giveaway ${giveaway.id}:`, error);
			}
		}
	}

	// Only an unknown/inaccessible guild counts as gone; any other failure throws so the giveaway is retried.
	private async fetchGuild(guildId: string): Promise<Guild | null> {
		try {
			return await this.container.client.guilds.fetch(guildId);
		} catch (error) {
			if (error instanceof DiscordAPIError && (error.code === 10004 || error.code === 50001)) return null;
			throw error;
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		endGiveaways: never;
	}
}
