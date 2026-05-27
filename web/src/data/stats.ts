import { TOTAL_CATEGORIES, TOTAL_COMMANDS } from "./commands";
import { readLatestPublicBotStatsSnapshot } from "./publicStatsDb";

export interface PublicWebStats {
	servers: number | null;
	latencyMs: number | null;
	commands: number;
	categories: number;
	commandsRun: number | null;
	capturedAt: Date | null;
}

export async function getStats(): Promise<PublicWebStats> {
	const snapshot = await readLatestPublicBotStatsSnapshot();

	return {
		servers: snapshot?.guilds ?? null,
		latencyMs: snapshot?.latencyMs ?? null,
		commands: TOTAL_COMMANDS,
		categories: TOTAL_CATEGORIES,
		commandsRun: snapshot?.commandsRun ?? null,
		capturedAt: snapshot?.capturedAt ?? null,
	};
}

export function formatStatNumber(value: number | null): string {
	return value === null ? "unavailable" : value.toLocaleString();
}

export function formatLatency(value: number | null): string {
	return value === null ? "unavailable" : `${value}ms`;
}
