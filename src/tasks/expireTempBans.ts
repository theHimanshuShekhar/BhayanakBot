import { container } from "@sapphire/framework";
import { type Guild, RESTJSONErrorCodes } from "discord.js";
import { createCase, deactivateCase, getExpiredActiveCases } from "../db/queries/modCases.js";
import { isDiscordApiError } from "../lib/discordErrors.js";
import type { TaskDefinition } from "./scheduler.js";

export const expireTempBans: TaskDefinition = {
	name: "expireTempBans",
	intervalMs: 30_000,
	runOnStartup: true,
	async run() {
		const expired = await getExpiredActiveCases("tempban");

		for (const modCase of expired) {
			try {
				let guild: Guild;
				try {
					guild = await container.client.guilds.fetch(modCase.guildId);
				} catch (error) {
					if (isDiscordApiError(error, RESTJSONErrorCodes.UnknownGuild)) {
						// The bot was removed from the guild and can no longer lift the ban.
						await deactivateCase(modCase.id);
					} else {
						container.logger.warn(
							`[ExpireTempBans] Failed to fetch guild ${modCase.guildId} for case #${modCase.id} (${String(error)}) — will retry`,
						);
					}
					continue;
				}

				try {
					await guild.members.unban(modCase.userId, "Temporary ban expired");
				} catch (error) {
					// Unknown Ban means the user is already unbanned, which is the outcome we wanted.
					if (!isDiscordApiError(error, RESTJSONErrorCodes.UnknownBan)) {
						container.logger.warn(
							`[ExpireTempBans] Failed to unban ${modCase.userId} in ${modCase.guildId} (${String(error)}) — will retry`,
						);
						continue;
					}
				}

				await deactivateCase(modCase.id);

				await createCase({
					guildId: modCase.guildId,
					userId: modCase.userId,
					moderatorId: container.client.user!.id,
					type: "unban",
					reason: "Temporary ban expired",
					active: false,
				});
			} catch (error) {
				container.logger.error(`[ExpireTempBans] Failed to process case #${modCase.id}:`, error);
			}
		}
	},
};
