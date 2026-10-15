import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");

describe(".env.example", () => {
	it("documents active runtime and compose environment variables", () => {
		for (const variable of [
			"DISCORD_TOKEN",
			"DATABASE_URL",
			"TEST_DATABASE_URL",
			"POSTGRES_PASSWORD",
			"ZEN_API_KEY",
			"ZEN_ALLOW_DISCORD_CONTENT",
			"ZEN_BASE_URL",
			"ZEN_MODEL",
			"ZEN_TIMEOUT_MS",
			"WEB_PORT",
			"PUBLIC_BOT_INVITE_URL",
			"PUBLIC_STATS_INTERVAL_MS",
			"DASHBOARD_PRESENCE_INTERVAL_MS",
			"NODE_ENV",
			"TARGET_GUILD_ID",
			"TARGET_TEXT_CHANNEL_ID",
			"GUESS_WHO_CHANNEL_ID",
			"GUESS_WHO_BACKFILL_LIMIT",
			"BOT_OWNER_ID",
			"PALWORLD_API_URL",
			"PALWORLD_ADMIN_KEY",
			"MINECRAFT_RCON_HOST",
			"MINECRAFT_RCON_PORT",
			"MINECRAFT_RCON_PASSWORD",
			"YOUTUBE_COOKIE",
		]) {
			expect(envExample).toContain(`${variable}=`);
		}
	});

	it("does not document removed Ollama variables", () => {
		expect(envExample).not.toMatch(/OLLAMA_/);
	});

	it("does not document removed legacy voice or YouTube OAuth variables", () => {
		expect(envExample).not.toMatch(/WHISPER_|PIPER_|YOUTUBE_OAUTH_CREDENTIALS/);
	});
});
