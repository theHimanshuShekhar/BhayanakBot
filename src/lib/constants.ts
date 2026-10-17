import { envIntOr, envOr, optionalEnv } from "./env.js";

// Central constants for LLM feature gating — overridable via env vars. Blank values use the default.
const DEFAULT_TARGET_GUILD_ID = "199168135935295488";

// The Home Server. A blank value (Docker Compose passes `${TARGET_GUILD_ID:-}`) falls back to the default
// rather than becoming "", which would make every guild registration invalid.
/** Read live so a late-set TARGET_GUILD_ID is honoured; `TARGET_GUILD_ID` below is the import-time value. */
export const getTargetGuildId = (): string => envOr("TARGET_GUILD_ID", DEFAULT_TARGET_GUILD_ID);

export const TARGET_GUILD_ID = getTargetGuildId();
export const GUESS_WHO_CHANNEL_ID = envOr("GUESS_WHO_CHANNEL_ID", "199168135935295488");
export const GUESS_WHO_BACKFILL_LIMIT = envIntOr("GUESS_WHO_BACKFILL_LIMIT", 1000);

// Optional bot owner ID. When unset or blank, owner bypasses are disabled.
export const BOT_OWNER_ID = optionalEnv("BOT_OWNER_ID");
