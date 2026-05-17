import "dotenv/config";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-scheduled-tasks/register";

import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeExtractor, Log as YTLog } from "discord-player-youtubei";
import { BhayanakClient } from "./lib/BhayanakClient.js";
import { registerPlayerEvents } from "./lib/music/events.js";
import { ensureOllamaModel } from "./lib/ollama.js";

const client = new BhayanakClient();

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
		await ensureOllamaModel();
		await client.player.extractors.loadMulti(DefaultExtractors);
		await client.player.extractors.register(YoutubeExtractor, {
			cookie: process.env.YOUTUBE_COOKIE,
		});
		YTLog.setLevel(YTLog.Level.NONE);
		registerPlayerEvents(client.player);
		await client.login(process.env.DISCORD_TOKEN);

		client.once("clientReady", () => {
			client.logger.info(`[ready] Logged in as ${client.user?.tag} (${client.user?.id})`);
			client.logger.info(`[ready] Serving ${client.guilds.cache.size} guild(s):`);
			for (const guild of client.guilds.cache.values()) {
				const joined = guild.joinedAt;
				const duration = joined ? formatDuration(Date.now() - joined.getTime()) : "unknown";
				client.logger.info(`  - ${guild.name} (${guild.id}) — member for ${duration}`);
			}
		});

		// Run initial scheduled tasks non-blocking so startup can't hang
		// If a task fails, it logs but doesn't block the bot from processing events
		const runTask = async (name: string) => {
			const start = Date.now();
			try {
				await client.stores
					.get("scheduled-tasks")
					.get(name)
					?.run(null as never);
				client.logger.info(`[startup] Task ${name} completed in ${Date.now() - start}ms`);
			} catch (err) {
				client.logger.error(`[startup] Task ${name} failed after ${Date.now() - start}ms:`, err);
			}
		};

		const startupTasks = [
			"expireMutes",
			"expireTempBans",
			"sendReminders",
			"endGiveaways",
			"endPolls",
			"reloadOnRestart",
			"generateDailyQuests",
			"refreshPersonalityProfiles",
		];
		for (const taskName of startupTasks) {
			void runTask(taskName);
		}

		// Schedule interval runs (every 30 seconds)
		const tasks = ["expireMutes", "expireTempBans", "sendReminders", "endGiveaways", "endPolls"] as const;
		const taskRunning: Partial<Record<(typeof tasks)[number], boolean>> = {};
		for (const taskName of tasks) {
			setInterval(async () => {
				if (taskRunning[taskName]) return;
				taskRunning[taskName] = true;
				try {
					await client.stores
						.get("scheduled-tasks")
						.get(taskName)
						?.run(null as never);
				} catch (err) {
					client.logger.error(`[ScheduledTask:${taskName}] Error:`, err);
				} finally {
					taskRunning[taskName] = false;
				}
			}, 30_000);
		}

		// Refresh personality profiles every 6 hours
		let personalityTaskRunning = false;
		setInterval(
			async () => {
				if (personalityTaskRunning) return;
				personalityTaskRunning = true;
				try {
					await client.stores
						.get("scheduled-tasks")
						.get("refreshPersonalityProfiles")
						?.run(null as never);
				} catch (err) {
					client.logger.error("[ScheduledTask:refreshPersonalityProfiles] Error:", err);
				} finally {
					personalityTaskRunning = false;
				}
			},
			6 * 60 * 60 * 1000,
		);

		// Check once per hour — task is idempotent, skips if quests already exist for today
		let questTaskRunning = false;
		setInterval(
			async () => {
				if (questTaskRunning) return;
				questTaskRunning = true;
				try {
					await client.stores
						.get("scheduled-tasks")
						.get("generateDailyQuests")
						?.run(null as never);
				} catch (err) {
					client.logger.error("[ScheduledTask:generateDailyQuests] Error:", err);
				} finally {
					questTaskRunning = false;
				}
			},
			60 * 60 * 1000,
		);
	} catch (error) {
		client.logger.fatal(error);
		client.destroy();
		process.exit(1);
	}
}

async function shutdown() {
	await client.player.destroy();
	client.destroy();
	process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

process.on("unhandledRejection", (reason, promise) => {
	client.logger.error("[process] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
	client.logger.error("[process] Uncaught Exception:", error);
	void shutdown();
});

void main();
