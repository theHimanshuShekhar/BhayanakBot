import "dotenv/config";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";

import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeExtractor, Log as YTLog } from "discord-player-youtubei";
import { getGuildAutoResponses } from "./db/queries/autoResponses.js";
import { getOrCreateSettings } from "./db/queries/guildSettings.js";
import { getUsersEligibleForInitialPersonalityBuild } from "./db/queries/personalityTraining.js";
import { preloadConversationHistoryForChannels } from "./lib/autoresponder/conversationHistory.js";
import { BhayanakClient } from "./lib/BhayanakClient.js";
import { validateRuntimeConfig } from "./lib/config.js";
import { TARGET_TEXT_CHANNEL_ID } from "./lib/constants.js";
import { optionalEnv } from "./lib/env.js";
import { PERSONALITY_GENERATION_ENABLED } from "./lib/features.js";
import { backfillGuessWhoMessages } from "./lib/guessWho/backfill.js";
import { removeGlobalHomeServerCommands } from "./lib/homeServer.js";
import { registerPlayerEvents } from "./lib/music/events.js";
import { buildPersonalityProfile, INITIAL_USER_PROFILE_THRESHOLD } from "./lib/personality/buildProfile.js";
import { getTasks } from "./tasks/index.js";
import { createTaskScheduler } from "./tasks/scheduler.js";

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
			void preloadConversationHistoryCache().catch((err) =>
				client.logger.error("[conversation-history] Startup preload failed:", err),
			);

			void backfillGuessWhoMessages(client)
				.then(async (count) => {
					client.logger.info(`[guess-who] Backfilled ${count} archived message(s)`);
					if (PERSONALITY_GENERATION_ENABLED) await buildEligibleBackfilledPersonalityProfiles();
				})
				.catch((err) => client.logger.error("[guess-who] Backfill failed:", err));
		});
		await client.login(process.env.DISCORD_TOKEN);

		// Cold-start pass is non-blocking so a slow task can't hang startup; failures are logged per task.
		createTaskScheduler(getTasks(), client.logger).start();
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
