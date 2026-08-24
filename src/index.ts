import "dotenv/config";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-scheduled-tasks/register";

import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeExtractor, Log as YTLog } from "discord-player-youtubei";
import { getGuildAutoResponses } from "./db/queries/autoResponses.js";
import { getOrCreateSettings } from "./db/queries/guildSettings.js";
import { getUsersEligibleForInitialPersonalityBuild } from "./db/queries/personalityTraining.js";
import { preloadConversationHistoryForChannels } from "./lib/autoresponder/conversationHistory.js";
import { BhayanakClient } from "./lib/BhayanakClient.js";
import { validateRuntimeConfig } from "./lib/config.js";
import { TARGET_TEXT_CHANNEL_ID } from "./lib/constants.js";
import { LOCAL_LLM_ENABLED, PERSONALITY_GENERATION_ENABLED, RPG_ENABLED } from "./lib/features.js";
import { backfillGuessWhoMessages } from "./lib/guessWho/backfill.js";
import { registerPlayerEvents } from "./lib/music/events.js";
import { callOllama, ensureOllamaModel } from "./lib/ollama.js";
import { buildPersonalityProfile, INITIAL_USER_PROFILE_THRESHOLD } from "./lib/personality/buildProfile.js";
import { getPublicStatsIntervalMs, writePublicBotStatsSnapshotForClient } from "./lib/publicStats.js";

validateRuntimeConfig();

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

async function preloadConversationHistoryCache(): Promise<void> {
	const channelIds = new Set<string>([TARGET_TEXT_CHANNEL_ID]);
	for (const guild of client.guilds.cache.values()) {
		try {
			const settings = await getOrCreateSettings(guild.id);
			if (settings.randomResponseChannelId) channelIds.add(settings.randomResponseChannelId);

			const autoResponses = await getGuildAutoResponses(guild.id);
			for (const autoResponse of autoResponses) {
				for (const channelId of autoResponse.channelIds) {
					channelIds.add(channelId);
				}
			}
		} catch (err) {
			client.logger.warn(`[conversation-history] Failed to collect preload channels for guild=${guild.id}:`, err);
		}
	}

	await preloadConversationHistoryForChannels(client, channelIds, client.logger);
}

async function buildEligibleBackfilledPersonalityProfiles(): Promise<void> {
	const users = await getUsersEligibleForInitialPersonalityBuild({
		minimumMessageCount: INITIAL_USER_PROFILE_THRESHOLD,
	});
	if (users.length === 0) return;

	client.logger.info(`[personality] Building initial profiles for ${users.length} backfilled user(s)`);

	for (const { userId, guildId } of users) {
		try {
			const result = await buildPersonalityProfile(userId, guildId);
			if (result.status !== "built") {
				client.logger.debug(
					`[personality] Backfilled initial build skipped for userId=${userId} guildId=${guildId}: ${result.status}`,
				);
			}
		} catch (err) {
			client.logger.error(
				`[personality] Backfilled initial build failed for userId=${userId} guildId=${guildId}:`,
				err,
			);
		}
	}
}

async function main() {
	try {
		if (LOCAL_LLM_ENABLED) {
			await ensureOllamaModel();
			// Warm up Ollama model so first real request doesn't timeout during lazy load
			const warmup = await callOllama("", "hi", 10_000, 1);
			if (warmup !== null) {
				client.logger.info("[ollama] Model warmed up");
			}
		}
		await client.player.extractors.loadMulti(DefaultExtractors);
		await client.player.extractors.register(YoutubeExtractor, {
			cookie: process.env.YOUTUBE_COOKIE,
		});
		YTLog.setLevel(YTLog.Level.NONE);
		registerPlayerEvents(client.player);

		let publicStatsWriteRunning = false;
		const writePublicStats = async () => {
			if (publicStatsWriteRunning) return;
			publicStatsWriteRunning = true;
			try {
				await writePublicBotStatsSnapshotForClient(client);
				client.logger.info("[public-stats] Snapshot written");
			} catch (err) {
				client.logger.error("[public-stats] Snapshot failed:", err);
			} finally {
				publicStatsWriteRunning = false;
			}
		};

		client.once("clientReady", () => {
			client.logger.info(`[ready] Logged in as ${client.user?.tag} (${client.user?.id})`);
			client.logger.info(`[ready] Serving ${client.guilds.cache.size} guild(s):`);
			for (const guild of client.guilds.cache.values()) {
				const joined = guild.joinedAt;
				const duration = joined ? formatDuration(Date.now() - joined.getTime()) : "unknown";
				client.logger.info(`  - ${guild.name} (${guild.id}) — member for ${duration}`);
			}

			void writePublicStats();
			void preloadConversationHistoryCache().catch((err) =>
				client.logger.error("[conversation-history] Startup preload failed:", err),
			);
			setInterval(
				() => void writePublicStats(),
				getPublicStatsIntervalMs({ PUBLIC_STATS_INTERVAL_MS: process.env.PUBLIC_STATS_INTERVAL_MS }),
			);

			void backfillGuessWhoMessages(client)
				.then(async (count) => {
					client.logger.info(`[guess-who] Backfilled ${count} archived message(s)`);
					if (PERSONALITY_GENERATION_ENABLED) await buildEligibleBackfilledPersonalityProfiles();
				})
				.catch((err) => client.logger.error("[guess-who] Backfill failed:", err));
		});
		await client.login(process.env.DISCORD_TOKEN);

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
			"syncPalworldTracker",
		];
		if (RPG_ENABLED) startupTasks.push("generateDailyQuests");
		if (PERSONALITY_GENERATION_ENABLED) startupTasks.push("refreshPersonalityProfiles");
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

		if (PERSONALITY_GENERATION_ENABLED) {
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
		}

		// Sweep the Palworld roster every 10 minutes
		let palworldTaskRunning = false;
		setInterval(
			async () => {
				if (palworldTaskRunning) return;
				palworldTaskRunning = true;
				try {
					await client.stores
						.get("scheduled-tasks")
						.get("syncPalworldTracker")
						?.run(null as never);
				} catch (err) {
					client.logger.error("[ScheduledTask:syncPalworldTracker] Error:", err);
				} finally {
					palworldTaskRunning = false;
				}
			},
			10 * 60 * 1000,
		);

		if (RPG_ENABLED) {
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
		}
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
