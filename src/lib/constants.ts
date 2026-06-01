// Central constants for LLM feature gating — overridable via env vars
export const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID ?? "199168135935295488";
export const TARGET_TEXT_CHANNEL_ID = process.env.TARGET_TEXT_CHANNEL_ID ?? "199168135935295488";
export const GUESS_WHO_CHANNEL_ID = process.env.GUESS_WHO_CHANNEL_ID ?? "199168135935295488";
export const GUESS_WHO_BACKFILL_LIMIT = Number.parseInt(process.env.GUESS_WHO_BACKFILL_LIMIT ?? "1000", 10);

// Optional bot owner ID. When unset or blank, owner bypasses are disabled.
export const BOT_OWNER_ID = process.env.BOT_OWNER_ID?.trim() || undefined;
