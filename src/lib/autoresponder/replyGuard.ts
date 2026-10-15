// Keeps every AI reply path honest: one message gets at most one AI reply, and the two random-reply
// paths (messageCreate and randomResponder) share one per-channel cooldown.

import { ExpiringBoundedMap } from "../boundedMap.js";

/** Minimum gap between two random AI replies in the same channel. */
export const RANDOM_REPLY_COOLDOWN_MS = 45 * 1000;

const CLAIM_TTL_MS = 5 * 60 * 1000;
const CLAIM_MAX_ENTRIES = 5_000;
const CHANNEL_MAX_ENTRIES = 1_000;

interface Claim {
	kind: "ai" | "static" | "random" | "moderated";
	at: number;
}

// Message id -> who answers it. A claim is held for CLAIM_TTL_MS, far longer than any reply takes.
const claims = new ExpiringBoundedMap<string, Claim>(CLAIM_MAX_ENTRIES, CLAIM_TTL_MS, (claim) => new Date(claim.at));
// Channel id -> when its last random reply was actually sent.
const randomLastSent = new ExpiringBoundedMap<string, number>(
	CHANNEL_MAX_ENTRIES,
	RANDOM_REPLY_COOLDOWN_MS,
	(sentAt) => new Date(sentAt),
);
// Channels with a random reply being generated right now, so a burst cannot start several calls.
const randomInFlight = new Set<string>();

/**
 * Claim a message for a direct AI reply (LLM autoresponse or bot mention). Returns false when another direct
 * AI reply already owns it. A direct reply outranks a random one: it takes over a random reservation, whose
 * `stillOwned()` then turns false so the random reply is dropped before it is sent.
 */
export function claimAiReply(messageId: string): boolean {
	const now = Date.now();
	const owner = claims.get(messageId)?.kind;
	if (owner === "ai" || owner === "moderated") return false;
	claims.set(messageId, { kind: "ai", at: now });
	return true;
}

/** Note that a static autoresponse answers the message, so no random AI reply is added to it. */
export function markStaticReply(messageId: string): void {
	const now = Date.now();
	const owner = claims.get(messageId)?.kind;
	if (owner === "ai" || owner === "moderated") return;
	claims.set(messageId, { kind: "static", at: now });
}

/**
 * Note that auto-mod removed the message: no AI reply, direct or random, may answer it. This also cancels a
 * random reply already being generated (its `stillOwned()` turns false).
 */
export function markModerated(messageId: string): void {
	claims.set(messageId, { kind: "moderated", at: Date.now() });
}

export interface RandomReplyTicket {
	/** False once a direct reply took the message over; check just before sending. */
	stillOwned(): boolean;
	/** Always call when done. Only `sent: true` starts the channel cooldown. */
	finish(sent: boolean): void;
}

/**
 * Reserve a random AI reply for a message. Returns null when the message already has a reply, the channel is
 * still on cooldown, or another random reply is being generated in it.
 */
export function beginRandomReply(messageId: string, channelId: string): RandomReplyTicket | null {
	const now = Date.now();
	if (claims.get(messageId) !== undefined || randomInFlight.has(channelId)) return null;
	const lastSent = randomLastSent.get(channelId);
	if (lastSent !== undefined && now - lastSent < RANDOM_REPLY_COOLDOWN_MS) return null;

	const claim: Claim = { kind: "random", at: now };
	claims.set(messageId, claim);
	randomInFlight.add(channelId);

	let finished = false;
	return {
		stillOwned: () => claims.get(messageId) === claim,
		finish: (sent) => {
			if (finished) return;
			finished = true;
			randomInFlight.delete(channelId);
			if (sent) randomLastSent.set(channelId, Date.now());
		},
	};
}

interface RandomReplySettings {
	randomResponseChannelId: string | null;
	randomResponseChance: number;
}

/**
 * Why a message is outside the configured random-reply settings, or null when it is inside them. The roll
 * against `randomResponseChance` is left to the caller.
 */
export function randomReplySkipReason(
	settings: RandomReplySettings,
	channelId: string,
): "not-configured" | "wrong-channel" | null {
	if (!settings.randomResponseChannelId || settings.randomResponseChance <= 0) return "not-configured";
	if (channelId !== settings.randomResponseChannelId) return "wrong-channel";
	return null;
}

export const replyGuardTestHooks = {
	reset() {
		claims.clear();
		randomLastSent.clear();
		randomInFlight.clear();
	},
	sizes: () => ({ claims: claims.size, randomLastSent: randomLastSent.size }),
};
