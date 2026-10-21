// Cooldowns and in-flight guards for the reply pipeline. Which surface answers a message is decided once, in
// `decideReply`; this module only keeps a surface from firing too often. A cooldown starts only when a reply was
// actually sent, so a failed reply costs nothing. An in-flight key keeps a burst of messages from starting several
// LLM calls while the first reply is still being written. Random Replies also need an active channel and spacing
// between replies; the per-channel human-message activity behind those two gates lives here too.

import { ExpiringBoundedMap } from "../boundedMap.js";

/** Minimum gap between two Random Replies in the same channel. */
export const RANDOM_REPLY_COOLDOWN_MS = 45 * 1000;
/** Minimum gap between two Mention Replies to the same member. */
export const MENTION_COOLDOWN_MS = 10 * 1000;
/** Minimum gap between two firings of the same autoresponse trigger (a bot mention bypasses it). */
export const AUTORESPONSE_TRIGGER_COOLDOWN_MS = 10 * 60 * 1000;
/** Minimum gap between two autoresponses to the same member. */
export const AUTORESPONSE_USER_COOLDOWN_MS = 30 * 1000;

/** A Random Reply needs this much recent chat: at least `MIN_MESSAGES` human messages from `MIN_MEMBERS` members. */
export const RANDOM_REPLY_ACTIVITY_WINDOW_MS = 10 * 60 * 1000;
export const RANDOM_REPLY_MIN_MESSAGES = 5;
export const RANDOM_REPLY_MIN_MEMBERS = 2;
/** Human messages that must pass in the channel after a sent Random Reply before the next roll. */
export const RANDOM_REPLY_MIN_SPACING = 30;

const MAX_ENTRIES = 5_000;
/** Recent messages kept per channel; far above `RANDOM_REPLY_MIN_MESSAGES`, so counts only saturate. */
const MAX_ACTIVITY_ENTRIES = 200;
const MAX_ACTIVITY_CHANNELS = 20;

class Cooldown {
	private readonly lastSent: ExpiringBoundedMap<string, number>;
	private readonly inFlight = new Set<string>();

	constructor(
		readonly name: string,
		cooldownMs: number,
	) {
		this.lastSent = new ExpiringBoundedMap<string, number>(MAX_ENTRIES, cooldownMs, (sentAt) => new Date(sentAt));
	}

	/** Why `key` may not start a reply right now, or null when it may. */
	blockedBy(key: string): string | null {
		if (this.inFlight.has(key)) return `${this.name}-in-flight`;
		if (this.lastSent.get(key) !== undefined) return `${this.name}-cooldown`;
		return null;
	}

	hold(key: string): void {
		this.inFlight.add(key);
	}

	release(key: string, sent: boolean): void {
		this.inFlight.delete(key);
		if (sent) this.lastSent.set(key, Date.now());
	}

	clear(): void {
		this.lastSent.clear();
		this.inFlight.clear();
	}

	get size(): number {
		return this.lastSent.size;
	}
}

const triggerCooldown = new Cooldown("trigger", AUTORESPONSE_TRIGGER_COOLDOWN_MS);
const userAutoresponseCooldown = new Cooldown("user", AUTORESPONSE_USER_COOLDOWN_MS);
const mentionCooldown = new Cooldown("mention", MENTION_COOLDOWN_MS);
const randomCooldown = new Cooldown("random", RANDOM_REPLY_COOLDOWN_MS);

/** What a Random Reply gate needs to know about a channel's human chat. */
export interface ChannelActivity {
	/** Human messages in the last `RANDOM_REPLY_ACTIVITY_WINDOW_MS`, the current one included. */
	messages: number;
	/** Distinct authors of those messages. */
	members: number;
	/** Human messages since the last sent Random Reply; a channel with none yet counts as spaced. */
	sinceLastReply: number;
}

interface ChannelLog {
	recent: { at: number; userId: string }[];
	sinceLastReply: number;
}

// Only the Home Server's random-reply channel is ever recorded, so this stays a handful of small entries.
const channelLogs = new Map<string, ChannelLog>();

/**
 * Records a human message in a channel and returns its activity, the message included. Call it before deciding
 * the reply so the message counts toward its own gate.
 */
export function recordChannelMessage(channelId: string, userId: string, now: number = Date.now()): ChannelActivity {
	let log = channelLogs.get(channelId);
	if (!log) {
		if (channelLogs.size >= MAX_ACTIVITY_CHANNELS) {
			const oldest = channelLogs.keys().next().value;
			if (oldest !== undefined) channelLogs.delete(oldest);
		}
		log = { recent: [], sinceLastReply: RANDOM_REPLY_MIN_SPACING };
		channelLogs.set(channelId, log);
	}

	const cutoff = now - RANDOM_REPLY_ACTIVITY_WINDOW_MS;
	const firstKept = log.recent.findIndex((entry) => entry.at > cutoff);
	log.recent = firstKept === -1 ? [] : log.recent.slice(firstKept);
	log.recent.push({ at: now, userId });
	if (log.recent.length > MAX_ACTIVITY_ENTRIES) log.recent.shift();
	log.sinceLastReply = Math.min(log.sinceLastReply + 1, RANDOM_REPLY_MIN_SPACING);

	return {
		messages: log.recent.length,
		members: new Set(log.recent.map((entry) => entry.userId)).size,
		sinceLastReply: log.sinceLastReply,
	};
}

/** Why a Random Reply may not be rolled for this activity, or null when it may. */
export function randomReplySkipReason(activity: ChannelActivity): "quiet" | "spacing" | null {
	if (activity.messages < RANDOM_REPLY_MIN_MESSAGES || activity.members < RANDOM_REPLY_MIN_MEMBERS) return "quiet";
	if (activity.sinceLastReply < RANDOM_REPLY_MIN_SPACING) return "spacing";
	return null;
}

export type ReplyGate = { ok: true; finish(sent: boolean): void } | { ok: false; reason: string };

interface GateKey {
	cooldown: Cooldown;
	key: string;
	/** False for a key that is held and cooled down but never blocks (the trigger, on a bot mention). */
	check?: boolean;
}

/** Checks every key, then holds them all. `finish(sent)` releases them and, when `sent`, starts their cooldowns. */
function begin(keys: GateKey[]): ReplyGate {
	for (const { cooldown, key, check = true } of keys) {
		const reason = check ? cooldown.blockedBy(key) : null;
		if (reason) return { ok: false, reason };
	}
	for (const { cooldown, key } of keys) cooldown.hold(key);

	let finished = false;
	return {
		ok: true,
		finish: (sent) => {
			if (finished) return;
			finished = true;
			for (const { cooldown, key } of keys) cooldown.release(key, sent);
		},
	};
}

/**
 * Gate an autoresponse (static or AI): 10 minutes per trigger and 30 seconds per member. A bot mention skips the
 * trigger check, but the trigger still starts its cooldown once the reply is sent.
 */
export function beginAutoresponse(input: {
	guildId: string;
	trigger: string;
	userId: string;
	botMentioned: boolean;
}): ReplyGate {
	return begin([
		{ cooldown: triggerCooldown, key: `${input.guildId}:${input.trigger}`, check: !input.botMentioned },
		{ cooldown: userAutoresponseCooldown, key: `${input.guildId}:${input.userId}` },
	]);
}

/** Gate a Mention Reply: 10 seconds per member. */
export function beginMention(guildId: string, userId: string): ReplyGate {
	return begin([{ cooldown: mentionCooldown, key: `${guildId}:${userId}` }]);
}

/**
 * Gate a Random Reply: 45 seconds per channel, and one being written at a time. A sent reply also restarts the
 * channel's spacing count; a failed or empty one leaves it alone.
 */
export function beginRandom(channelId: string): ReplyGate {
	const gate = begin([{ cooldown: randomCooldown, key: channelId }]);
	if (!gate.ok) return gate;
	return {
		ok: true,
		finish: (sent) => {
			gate.finish(sent);
			const log = channelLogs.get(channelId);
			if (sent && log) log.sinceLastReply = 0;
		},
	};
}

export const replyGuardTestHooks = {
	reset() {
		for (const cooldown of [triggerCooldown, userAutoresponseCooldown, mentionCooldown, randomCooldown]) {
			cooldown.clear();
		}
		channelLogs.clear();
	},
	sizes: () => ({
		trigger: triggerCooldown.size,
		user: userAutoresponseCooldown.size,
		mention: mentionCooldown.size,
		random: randomCooldown.size,
		channels: channelLogs.size,
		entries: [...channelLogs.values()].reduce((total, log) => total + log.recent.length, 0),
	}),
};
