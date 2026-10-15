import type { Client } from "discord.js";
import { TARGET_GUILD_ID } from "./constants.js";

/** Slash commands that are Home-Server Features (CONTEXT.md, ADR 0007). */
export const HOME_SERVER_COMMAND_NAMES: readonly string[] = ["summarize", "personality", "guess_who"];

/** Registry options that make a command a guild command in the Home Server only. */
export const HOME_SERVER_REGISTRATION = { guildIds: [TARGET_GUILD_ID] };

/** True only for the Home Server. Every Home-Server Feature gates on this one check. */
export function isHomeServer(guildId: string | null | undefined): boolean {
	return guildId === TARGET_GUILD_ID;
}

interface LoggerLike {
	info(...values: unknown[]): unknown;
	warn(...values: unknown[]): unknown;
}

/**
 * Sapphire never deletes commands: moving a command from global to guild registration leaves the old
 * global command behind, still visible in every guild. Delete those leftovers so the Home-Server
 * commands exist nowhere else.
 */
export async function removeGlobalHomeServerCommands(
	commands: Pick<Client<true>["application"]["commands"], "fetch" | "delete">,
	logger: LoggerLike,
): Promise<void> {
	try {
		const global = await commands.fetch();
		for (const command of global.values()) {
			if (!HOME_SERVER_COMMAND_NAMES.includes(command.name)) continue;
			await commands.delete(command.id);
			logger.info(`[home-server] Removed stale global /${command.name} command (${command.id})`);
		}
	} catch (err) {
		logger.warn("[home-server] Failed to remove stale global commands:", err);
	}
}
