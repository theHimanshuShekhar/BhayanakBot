import { container } from "@sapphire/framework";
import { getOrCreateSettings } from "../db/queries/guildSettings.js";
import { TARGET_GUILD_ID } from "./constants.js";
import type { LlmOutcome, ZenFailureReason } from "./llmProvider.js";
import { isPostableTextChannel } from "./textChannels.js";

/** Consecutive failed requests that make an AI Outage (CONTEXT.md). */
export const OUTAGE_THRESHOLD = 5;

// Provider failures only. A refusal is the model's answer, and the other reasons say nothing about Zen's health.
const COUNTED_REASONS: ReadonlySet<ZenFailureReason> = new Set(["http_error", "fetch_error", "empty", "truncated"]);

// In memory by design: a restart starts with a clean run.
let failures = 0;
let runStartedAt = 0;
let lastReason: ZenFailureReason = "http_error";
let outageActive = false;

const pendingNotices = new Set<Promise<void>>();

/** Resolves once every notice started so far has been posted or has failed. For tests. */
export async function settleOutageNotices(): Promise<void> {
	await Promise.allSettled([...pendingNotices]);
}

/** Forgets the current run and outage. For tests. */
export function resetAiOutage(): void {
	failures = 0;
	runStartedAt = 0;
	lastReason = "http_error";
	outageActive = false;
}

function formatDuration(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

async function postNotice(content: string): Promise<void> {
	try {
		const settings = await getOrCreateSettings(TARGET_GUILD_ID);
		if (!settings.logChannelId) {
			container.logger.warn(`[ai-outage] No log channel configured; not posting: ${content}`);
			return;
		}
		const channel = container.client.guilds.cache.get(TARGET_GUILD_ID)?.channels.cache.get(settings.logChannelId);
		if (!isPostableTextChannel(channel)) {
			container.logger.warn(
				`[ai-outage] Log channel ${settings.logChannelId} not found or not text; not posting: ${content}`,
			);
			return;
		}
		// No allowedMentions: the client default notifies nobody.
		await channel.send({ content });
	} catch (error) {
		container.logger.warn("[ai-outage] Could not post the notice:", error);
	}
}

// Fire and forget: the LLM caller never waits on Discord.
function notify(content: string): void {
	const pending = postNotice(content).finally(() => pendingNotices.delete(pending));
	pendingNotices.add(pending);
}

/** Observer for the LLM provider's final outcome per request. Never throws. */
export function recordLlmOutcome(outcome: LlmOutcome): void {
	try {
		if (outcome.ok) {
			if (outageActive) {
				notify(
					`✅ AI replies recovered after ${formatDuration(Date.now() - runStartedAt)} (${failures} failed requests).`,
				);
			}
			resetAiOutage();
			return;
		}
		if (!COUNTED_REASONS.has(outcome.reason)) return;

		if (failures === 0) runStartedAt = Date.now();
		failures++;
		lastReason = outcome.reason;
		if (failures >= OUTAGE_THRESHOLD && !outageActive) {
			outageActive = true;
			notify(
				`⚠️ AI replies are failing: ${failures} requests in a row (last: ${lastReason}). Members see no error; replies resume automatically.`,
			);
		}
	} catch (error) {
		container.logger.warn("[ai-outage] Could not record an outcome:", error);
	}
}
