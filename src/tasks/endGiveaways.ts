import { container } from "@sapphire/framework";
import { DiscordAPIError, type Guild } from "discord.js";
import {
	endGiveaway,
	getActiveExpiredGiveaways,
	getGiveawaysAwaitingAnnouncement,
	markGiveawayAnnounced,
	recordGiveawayAnnounceFailure,
} from "../db/queries/giveaways.js";
import {
	announceGiveawayEnd,
	endAndAnnounceGiveaway,
	GIVEAWAY_ANNOUNCE_MAX_ATTEMPTS,
	GIVEAWAY_ANNOUNCE_RETRY_DELAY_MS,
} from "../lib/giveaways.js";
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
		// Giveaways that ended but whose result was never posted: post it, without drawing again.
		const unannounced = await getGiveawaysAwaitingAnnouncement(new Date(Date.now() - GIVEAWAY_ANNOUNCE_RETRY_DELAY_MS));
		for (const giveaway of unannounced) {
			try {
				if (giveaway.announceAttempts >= GIVEAWAY_ANNOUNCE_MAX_ATTEMPTS) {
					await markGiveawayAnnounced(giveaway.id);
					container.logger.error(
						`[EndGiveaways] Giving up on announcing giveaway ${giveaway.id} after ${giveaway.announceAttempts} attempts`,
					);
					continue;
				}
				const guild = await fetchGuild(giveaway.guildId);
				if (guild) await announceGiveawayEnd(guild, giveaway);
				else await markGiveawayAnnounced(giveaway.id); // The bot left the guild: nobody to announce to.
			} catch (error) {
				container.logger.error(`[EndGiveaways] Failed to announce giveaway ${giveaway.id}:`, error);
				await recordGiveawayAnnounceFailure(giveaway.id).catch(() => null);
			}
		}

		const expired = await getActiveExpiredGiveaways();

		for (const giveaway of expired) {
			try {
				const guild = await fetchGuild(giveaway.guildId);
				if (!guild) {
					// The bot is no longer in the guild: nobody to draw from or announce to, so just close it.
					const ended = await endGiveaway(giveaway.guildId, giveaway.messageId, []);
					if (ended) await markGiveawayAnnounced(ended.id);
					continue;
				}
				await endAndAnnounceGiveaway(guild, giveaway);
			} catch (error) {
				container.logger.error(`[EndGiveaways] Failed to end giveaway ${giveaway.id}:`, error);
			}
		}
	},
};
