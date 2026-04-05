import "dotenv/config";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-scheduled-tasks/register";

import { BhayanakClient } from "./lib/BhayanakClient.js";
import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeiExtractor, Log as YTLog } from "discord-player-youtubei";

const client = new BhayanakClient();

async function main() {
	try {
		await client.player.extractors.loadMulti(DefaultExtractors);
		await client.player.extractors.register(YoutubeiExtractor, {
			authentication: process.env.YOUTUBE_OAUTH_CREDENTIALS,
		});
		YTLog.setLevel(YTLog.Level.NONE);
		await client.login(process.env.DISCORD_TOKEN);

		// Schedule recurring polling tasks via @sapphire/plugin-scheduled-tasks
		// These run on intervals using Valkey/BullMQ as the backend
		await client.stores.get("scheduled-tasks").get("expireMutes")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("expireTempBans")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("sendReminders")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("endGiveaways")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("endPolls")?.run(null as never);
		await client.stores.get("scheduled-tasks").get("reloadOnRestart")?.run(null as never);

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
	} catch (error) {
		client.logger.fatal(error);
		client.destroy();
		process.exit(1);
	}
}

void main();
