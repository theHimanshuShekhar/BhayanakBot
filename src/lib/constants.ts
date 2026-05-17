// Central constants for LLM feature gating — overridable via env vars
export const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID ?? "199168135935295488";
export const TARGET_TEXT_CHANNEL_ID = process.env.TARGET_TEXT_CHANNEL_ID ?? "199168135935295488";

// Bot owner ID — overridable via env var
export const BOT_OWNER_ID = process.env.BOT_OWNER_ID ?? "199168135935295488";

// Voice responder settings — overridable via env vars
export const VOICE_LISTEN_DURATION_MS = Number(process.env.VOICE_LISTEN_DURATION_MS ?? 30_000);
export const VOICE_MIN_HUMANS_TO_JOIN = Number(process.env.VOICE_MIN_HUMANS_TO_JOIN ?? 5);
export const VOICE_COOLDOWN_MS = Number(process.env.VOICE_COOLDOWN_MS ?? 120_000);
export const VOICE_AUDIO_CHUNK_MS = Number(process.env.VOICE_AUDIO_CHUNK_MS ?? 10_000);
