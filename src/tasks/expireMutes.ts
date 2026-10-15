import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, RESTJSONErrorCodes } from "discord.js";
import { eq } from "drizzle-orm";
import { createCase, deactivateCase, getExpiredActiveCases } from "../db/queries/modCases.js";
import { guildSettings } from "../db/schema.js";
import { db } from "../lib/database.js";
import { isDiscordApiError } from "../lib/discordErrors.js";
import type { TaskDefinition } from "./scheduler.js";

export const expireMutes: TaskDefinition = {
	name: "expireMutes",
	intervalMs: 30_000,
	runOnStartup: true,
	async run() {
		const expired = await getExpiredActiveCases("mute");

		for (const modCase of expired) {
			try {
				let guild: Guild;
				try {
					guild = await container.client.guilds.fetch(modCase.guildId);
				} catch (error) {
					if (isDiscordApiError(error, RESTJSONErrorCodes.UnknownGuild)) {
						// The bot was removed from the guild and can no longer lift the mute.
						await deactivateCase(modCase.id);
					} else {
						container.logger.warn(
							`[ExpireMutes] Failed to fetch guild ${modCase.guildId} for case #${modCase.id} (${String(error)}) — will retry`,
						);
					}
					continue;
				}

				const settings = await db.query.guildSettings.findFirst({
					where: eq(guildSettings.guildId, modCase.guildId),
				});

				if (settings?.mutedRoleId) {
					let member: GuildMember | null;
					try {
						member = await guild.members.fetch(modCase.userId);
					} catch (error) {
						// A member who left the guild no longer carries the muted role.
						if (!isDiscordApiError(error, RESTJSONErrorCodes.UnknownMember)) {
							container.logger.warn(
								`[ExpireMutes] Failed to fetch member ${modCase.userId} in ${modCase.guildId} (${String(error)}) — will retry`,
							);
							continue;
						}
						member = null;
					}
					if (member) {
						const removed = await member.roles
							.remove(settings.mutedRoleId, "Mute expired")
							.then(() => true)
							.catch(() => false);
						if (!removed) {
							container.logger.warn(
								`[ExpireMutes] Failed to remove muted role from ${modCase.userId} in ${modCase.guildId} — will retry`,
							);
							continue;
						}
					}
				}

				await deactivateCase(modCase.id);

				await createCase({
					guildId: modCase.guildId,
					userId: modCase.userId,
					moderatorId: container.client.user!.id,
					type: "unmute",
					reason: "Mute duration expired",
					active: false,
				});
			} catch (error) {
				container.logger.error(`[ExpireMutes] Failed to process case #${modCase.id}:`, error);
			}
		}
	},
};
