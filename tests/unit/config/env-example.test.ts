import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");

describe(".env.example", () => {
	it("documents active runtime and compose environment variables", () => {
		for (const variable of [
			"DISCORD_TOKEN",
			"DISCORD_CLIENT_ID",
			"DATABASE_URL",
			"TEST_DATABASE_URL",
			"VALKEY_URL",
			"POSTGRES_PASSWORD",
			"OLLAMA_URL",
			"OLLAMA_MODEL",
			"OLLAMA_DEBUG_CONTENT_LOGS",
			"ZEN_API_KEY",
			"ZEN_ALLOW_DISCORD_CONTENT",
			"ZEN_BASE_URL",
			"ZEN_MODEL",
			"ZEN_TIMEOUT_MS",
			"WEB_PORT",
			"PUBLIC_BOT_INVITE_URL",
			"PUBLIC_STATS_INTERVAL_MS",
			"NODE_ENV",
			"TARGET_GUILD_ID",
			"TARGET_TEXT_CHANNEL_ID",
			"GUESS_WHO_CHANNEL_ID",
			"GUESS_WHO_BACKFILL_LIMIT",
			"BOT_OWNER_ID",
			"YOUTUBE_COOKIE",
		]) {
			expect(envExample).toContain(`${variable}=`);
		}
	});

	it("does not document removed legacy voice or YouTube OAuth variables", () => {
		expect(envExample).not.toMatch(/WHISPER_|PIPER_|YOUTUBE_OAUTH_CREDENTIALS/);
	});
});
