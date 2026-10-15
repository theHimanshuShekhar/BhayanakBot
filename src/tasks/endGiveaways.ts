import { container } from "@sapphire/framework";
import { DiscordAPIError, type Guild } from "discord.js";
import { endGiveaway, getActiveExpiredGiveaways } from "../db/queries/giveaways.js";
import { endAndAnnounceGiveaway } from "../lib/giveaways.js";
import type { TaskDefinition } from "./scheduler.js";

// Only an unknown/inaccessible guild counts as gone; any other failure throws so the giveaway is retried.
async function fetchGuild(guildId: string): Promise<Guild | null> {
	try {
		return await container.client.guilds.fetch(guildId);
	} catch (error) {
		if (error instanceof DiscordAPIError && (error.code === 10004 || error.code === 50001)) return null;
		throw error;
	}
}

export const endGiveaways: TaskDefinition = {
	name: "endGiveaways",
	intervalMs: 30_000,
	runOnStartup: true,
	async run() {
		const expired = await getActiveExpiredGiveaways();

		for (const giveaway of expired) {
			try {
				const guild = await fetchGuild(giveaway.guildId);
				if (!guild) {
					// The bot is no longer in the guild: nobody to draw from or announce to, so just close it.
					await endGiveaway(giveaway.guildId, giveaway.messageId, []);
					continue;
				}
				await endAndAnnounceGiveaway(guild, giveaway);
			} catch (error) {
				container.logger.error(`[EndGiveaways] Failed to end giveaway ${giveaway.id}:`, error);
			}
		}
	},
};
