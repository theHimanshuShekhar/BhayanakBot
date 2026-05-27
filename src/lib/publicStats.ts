import type { Client } from "discord.js";
import {
	getCommandCounter,
	type PublicBotStatsSnapshotInput,
	writePublicBotStatsSnapshot,
} from "../db/queries/publicStats.js";

export const DEFAULT_PUBLIC_STATS_INTERVAL_MS = 5 * 60 * 1000;

type SnapshotClient = Pick<Client, "guilds" | "ws">;

export function getPublicStatsIntervalMs(env: Pick<NodeJS.ProcessEnv, "PUBLIC_STATS_INTERVAL_MS">): number {
	const value = Number(env.PUBLIC_STATS_INTERVAL_MS);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_PUBLIC_STATS_INTERVAL_MS;
}

export function buildPublicBotStatsSnapshotInput(
	client: SnapshotClient,
	commandsRun: number,
	capturedAt = new Date(),
): PublicBotStatsSnapshotInput {
	const ping = client.ws.ping;
	return {
		guilds: client.guilds.cache.size,
		commandsRun,
		latencyMs: Number.isFinite(ping) && ping >= 0 ? ping : null,
		capturedAt,
	};
}

export async function writePublicBotStatsSnapshotForClient(client: SnapshotClient): Promise<void> {
	const commandsRun = await getCommandCounter();
	await writePublicBotStatsSnapshot(buildPublicBotStatsSnapshotInput(client, commandsRun));
}
