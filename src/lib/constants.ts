// Central constants for LLM feature gating — overridable via env vars
export const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID ?? "199168135935295488";
export const TARGET_TEXT_CHANNEL_ID = process.env.TARGET_TEXT_CHANNEL_ID ?? "199168135935295488";

// Bot owner ID — overridable via env var
export const BOT_OWNER_ID = process.env.BOT_OWNER_ID ?? "199168135935295488";
