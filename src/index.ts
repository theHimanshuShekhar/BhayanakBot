import "dotenv/config";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-scheduled-tasks/register";

import { BhayanakClient } from "./lib/BhayanakClient.js";
import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeExtractor, Log as YTLog } from "discord-player-youtubei";
import { registerPlayerEvents } from "./lib/music/events.js";
import { ensureOllamaModel } from "./lib/ollama.js";

const client = new BhayanakClient();

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

		// Schedule recurring polling tasks via @sapphire/plugin-scheduled-tasks
		// These run on intervals using Valkey/BullMQ as the backend
		await client.stores.get("scheduled-tasks").get("expireMutes")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("expireTempBans")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("sendReminders")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("endGiveaways")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("endPolls")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("reloadOnRestart")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("generateDailyQuests")?.run(null as never);

		// Schedule interval runs (every 30 seconds)
		const tasks = ["expireMutes", "expireTempBans", "sendReminders", "endGiveaways", "endPolls"] as const;
		const taskRunning: Partial<Record<(typeof tasks)[number], boolean>> = {};
		for (const taskName of tasks) {
			setInterval(async () => {
				if (taskRunning[taskName]) return;
				taskRunning[taskName] = true;
				try {
					await client.stores.get("scheduled-tasks").get(taskName)?.run(null as never);
				} catch (err) {
					client.logger.error(`[ScheduledTask:${taskName}] Error:`, err);
				} finally {
					taskRunning[taskName] = false;
				}
			}, 30_000);
		}

		// Check once per hour — task is idempotent, skips if quests already exist for today
		let questTaskRunning = false;
		setInterval(async () => {
			if (questTaskRunning) return;
			questTaskRunning = true;
			try {
				await client.stores.get("scheduled-tasks").get("generateDailyQuests")?.run(null as never);
			} catch (err) {
				client.logger.error("[ScheduledTask:generateDailyQuests] Error:", err);
			} finally {
				questTaskRunning = false;
			}
		}, 60 * 60 * 1000);
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

void main();
