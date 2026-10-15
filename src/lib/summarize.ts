import type { TextBasedChannel } from "discord.js";

export const MAX_SUMMARY_MESSAGES = 200;
/** Upper bound on the transcript sent to the model; the oldest messages are dropped to fit. */
export const PROMPT_CHAR_BUDGET = 24_000;
export const EMBED_DESCRIPTION_LIMIT = 4096;

const PAGE_SIZE = 100;
// Bounds the work in channels where most recent messages are bots or attachments with no text.
const MAX_PAGES = 10;

export interface SummaryMessage {
	line: string;
	createdTimestamp: number;
}

export interface FetchOptions {
	/** Most messages to keep; the newest ones win. */
	limit: number;
	/** Only keep messages created at or after this epoch-ms time. */
	since?: number;
}

/**
 * Returns up to `limit` of the newest summarizable (non-bot, non-empty) messages, optionally no older
 * than `since`, in chronological order (oldest first).
 */
export async function fetchRecentMessages(channel: TextBasedChannel, options: FetchOptions): Promise<SummaryMessage[]> {
	const { limit, since } = options;
	const collected: SummaryMessage[] = []; // newest first
	let before: string | undefined;

	for (let page = 0; page < MAX_PAGES && collected.length < limit; page++) {
		const fetched = await channel.messages.fetch({ limit: PAGE_SIZE, ...(before ? { before } : {}) }).catch(() => null);
		if (!fetched || fetched.size === 0) break;

		const batch = [...fetched.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
		for (const m of batch) {
			if (since !== undefined && m.createdTimestamp < since) continue;
			const content = m.content.trim();
			if (m.author.bot || content.length === 0) continue;
			collected.push({ line: `${m.author.displayName}: ${content}`, createdTimestamp: m.createdTimestamp });
		}

		const oldest = batch[batch.length - 1];
		if (fetched.size < PAGE_SIZE || (since !== undefined && oldest.createdTimestamp < since)) break;
		before = oldest.id;
	}

	return collected.slice(0, limit).reverse();
}

/** Keeps the newest messages whose joined transcript fits in `budget` characters. */
export function trimToBudget(
	messages: SummaryMessage[],
	budget = PROMPT_CHAR_BUDGET,
): { messages: SummaryMessage[]; prompt: string } {
	const kept: SummaryMessage[] = [];
	let length = 0;

	for (let i = messages.length - 1; i >= 0; i--) {
		const cost = messages[i].line.length + (kept.length > 0 ? 1 : 0);
		if (length + cost > budget) break;
		kept.unshift(messages[i]);
		length += cost;
	}

	// A single oversized newest message still has to fit.
	if (kept.length === 0 && messages.length > 0) {
		const newest = messages[messages.length - 1];
		kept.push({ ...newest, line: newest.line.slice(0, budget) });
	}

	return { messages: kept, prompt: kept.map((m) => m.line).join("\n") };
}

/** States what the summary actually covered; `<t:...:t>` renders in each reader's local time. */
export function formatCoverage(count: number, firstTimestamp: number): string {
	const noun = count === 1 ? "message" : "messages";
	return `Summarized the last ${count} ${noun} (since <t:${Math.floor(firstTimestamp / 1000)}:t>)`;
}

/** Truncates to `limit` UTF-16 units without splitting a surrogate pair, marking the cut with an ellipsis. */
export function truncateForEmbed(text: string, limit = EMBED_DESCRIPTION_LIMIT): string {
	if (text.length <= limit) return text;
	let end = limit - 1;
	const last = text.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end--;
	return `${text.slice(0, end)}…`;
}
