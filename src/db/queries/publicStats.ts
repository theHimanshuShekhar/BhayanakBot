import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { botCommandCounters, publicBotStatsSnapshots } from "../schema.js";

const GLOBAL_COUNTER_NAME = "global";
const LATEST_SNAPSHOT_NAME = "latest";

export type PublicBotStatsSnapshot = typeof publicBotStatsSnapshots.$inferSelect;

export interface PublicBotStatsSnapshotInput {
	guilds: number;
	commandsRun: number;
	latencyMs: number | null;
	capturedAt?: Date;
}

export async function incrementCommandsRun(): Promise<number> {
	const now = new Date();
	const [row] = await db
		.insert(botCommandCounters)
		.values({ name: GLOBAL_COUNTER_NAME, commandsRun: 1, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: botCommandCounters.name,
			set: {
				commandsRun: sql`${botCommandCounters.commandsRun} + 1`,
				updatedAt: now,
			},
		})
		.returning({ commandsRun: botCommandCounters.commandsRun });

	return row.commandsRun;
}

export async function getCommandCounter(): Promise<number> {
	const row = await db.query.botCommandCounters.findFirst({ where: eq(botCommandCounters.name, GLOBAL_COUNTER_NAME) });
	return row?.commandsRun ?? 0;
}

export async function writePublicBotStatsSnapshot(input: PublicBotStatsSnapshotInput): Promise<PublicBotStatsSnapshot> {
	const now = new Date();
	const capturedAt = input.capturedAt ?? now;
	const [row] = await db
		.insert(publicBotStatsSnapshots)
		.values({
			name: LATEST_SNAPSHOT_NAME,
			guilds: input.guilds,
			commandsRun: input.commandsRun,
			latencyMs: input.latencyMs,
			capturedAt,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: publicBotStatsSnapshots.name,
			set: {
				guilds: input.guilds,
				commandsRun: input.commandsRun,
				latencyMs: input.latencyMs,
				capturedAt,
				updatedAt: now,
			},
		})
		.returning();

	return row;
}

export async function getLatestPublicBotStatsSnapshot(): Promise<PublicBotStatsSnapshot | null> {
	const row = await db.query.publicBotStatsSnapshots.findFirst({
		where: eq(publicBotStatsSnapshots.name, LATEST_SNAPSHOT_NAME),
	});
	return row ?? null;
}
