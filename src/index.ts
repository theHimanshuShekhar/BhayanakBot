import "dotenv/config";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";

import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeExtractor, Log as YTLog } from "discord-player-youtubei";
import { recordLlmOutcome } from "./lib/aiOutage.js";
import { BhayanakClient } from "./lib/BhayanakClient.js";
import { validateRuntimeConfig } from "./lib/config.js";
import { closeDatabase } from "./lib/database.js";
import { optionalEnv } from "./lib/env.js";
import { backfillGuessWhoMessages } from "./lib/guessWho/backfill.js";
import { removeGlobalHomeServerCommands } from "./lib/homeServer.js";
import { setLlmOutcomeObserver } from "./lib/llmProvider.js";
import { registerPlayerEvents } from "./lib/music/events.js";
import { createShutdown, FORCE_EXIT_MS } from "./lib/shutdown.js";
import { getTasks } from "./tasks/index.js";
import { createTaskScheduler, type TaskScheduler } from "./tasks/scheduler.js";

validateRuntimeConfig();
setLlmOutcomeObserver(recordLlmOutcome);

const client = new BhayanakClient();
let scheduler: TaskScheduler | undefined;

const shutdown = createShutdown({
	logger: client.logger,
	forceExitMs: FORCE_EXIT_MS,
	exit: (code) => process.exit(code),
	// Tasks and the player stop first so nothing starts new work; the pool closes last because they use it.
	steps: [
		{ name: "task scheduler", run: () => scheduler?.stop() },
		{ name: "music player", run: () => client.player.destroy() },
		{ name: "discord client", run: () => client.destroy() },
		{ name: "database pool", run: () => closeDatabase() },
	],
});

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (years > 0) return `${years}y ${months % 12}mo ${days % 30}d`;
	if (months > 0) return `${months}mo ${days % 30}d ${hours % 24}h`;
	if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
	if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

async function main() {
	try {
		await client.player.extractors.loadMulti(DefaultExtractors);
		await client.player.extractors.register(YoutubeExtractor, {
			cookie: optionalEnv("YOUTUBE_COOKIE"),
		});
		YTLog.setLevel(YTLog.Level.NONE);
		registerPlayerEvents(client.player);

		client.once("clientReady", () => {
			client.logger.info(`[ready] Logged in as ${client.user?.tag} (${client.user?.id})`);
			client.logger.info(`[ready] Serving ${client.guilds.cache.size} guild(s):`);
			for (const guild of client.guilds.cache.values()) {
				const joined = guild.joinedAt;
				const duration = joined ? formatDuration(Date.now() - joined.getTime()) : "unknown";
				client.logger.info(`  - ${guild.name} (${guild.id}) — member for ${duration}`);
			}

			if (client.application) void removeGlobalHomeServerCommands(client.application.commands, client.logger);

			void backfillGuessWhoMessages(client)
				.then((count) => client.logger.info(`[guess-who] Backfilled ${count} archived message(s)`))
				.catch((err) => client.logger.error("[guess-who] Backfill failed:", err));
		});
		await client.login(process.env.DISCORD_TOKEN);

		// Cold-start pass is non-blocking so a slow task can't hang startup; failures are logged per task.
		scheduler = createTaskScheduler(getTasks(), client.logger);
		scheduler.start();
	} catch (error) {
		client.logger.fatal(error);
		await shutdown("startup failure", 1);
	}
}

// `on`, not `once`: a repeated signal must reach the re-entry guard instead of Node's default handler.
process.on("SIGINT", () => void shutdown("SIGINT", 0));
process.on("SIGTERM", () => void shutdown("SIGTERM", 0));

// Logged only. Nearly every handler is fire-and-forget, durable state lives in Postgres, and one failed Discord
// call should not take down the bot. An uncaught exception is different: the process state is unknown.
process.on("unhandledRejection", (reason, promise) => {
	client.logger.error("[process] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
	client.logger.error("[process] Uncaught Exception:", error);
	void shutdown("uncaught exception", 1);
});

void main();
