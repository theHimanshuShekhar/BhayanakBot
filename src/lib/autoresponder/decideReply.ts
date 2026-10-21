import type { Message } from "discord.js";
import type { MatchResult } from "../../db/queries/autoResponses.js";
import { GUESS_WHO_CHANNEL_ID } from "../constants.js";
import { type ChannelActivity, randomReplySkipReason } from "./replyGuard.js";

export type ReplyDecision =
	| { kind: "autoresponse"; match: MatchResult }
	| { kind: "mention" }
	| { kind: "random" }
	| { kind: "none" };

export interface ReplyDecisionInput {
	/** The autoresponse that matches the message, if any. */
	match: MatchResult | null | undefined;
	isHomeServer: boolean;
	botMentioned: boolean;
	/** Asked at most once, and only when nothing else answers; true means the Random Reply fires. */
	rollRandom: () => boolean;
}

/**
 * The One Reply Rule: a message gets at most one reply. A matching autoresponse (static or AI) answers first
 * and keeps the message even when a cooldown or the Home Server gate then stops it. Otherwise a Mention Reply
 * answers. A Random Reply is posted only when nothing else did. Mention and Random Replies are Home-Server only.
 */
export function decideReply(input: ReplyDecisionInput): ReplyDecision {
	if (input.match) return { kind: "autoresponse", match: input.match };
	if (!input.isHomeServer) return { kind: "none" };
	if (input.botMentioned) return { kind: "mention" };
	if (input.rollRandom()) return { kind: "random" };
	return { kind: "none" };
}

/** True when the message mentions the bot itself. `@everyone` and `@here` do not count. */
export function isBotMentioned(message: Message): boolean {
	return message.mentions.has(message.client.user, { ignoreEveryone: true });
}

interface RandomReplySettings {
	randomResponseChannelId: string | null;
	randomResponseChance: number;
}

/** The channel Random Replies run in: the configured `random-response-channel`, else the Guess Who Channel. */
export function randomReplyChannelId(
	settings: Pick<RandomReplySettings, "randomResponseChannelId">,
	defaultChannelId: string = GUESS_WHO_CHANNEL_ID,
): string {
	return settings.randomResponseChannelId ?? defaultChannelId;
}

/**
 * Rolls the Random Reply chance once, but only for the guild's random-reply channel and a chance above 0. Two
 * gates come before the roll, and nothing is rolled when either fails: the channel must be active (see
 * `randomReplySkipReason`) and enough human chat must have passed since the last sent Random Reply. `activity`
 * is the channel's, the current message included; `onSkip` hears which gate stopped the roll.
 */
export function rollRandomReply(
	settings: RandomReplySettings,
	channelId: string,
	activity: ChannelActivity,
	{ defaultChannelId, onSkip }: { defaultChannelId?: string; onSkip?: (reason: "quiet" | "spacing") => void } = {},
): boolean {
	if (settings.randomResponseChance <= 0) return false;
	if (channelId !== randomReplyChannelId(settings, defaultChannelId)) return false;
	const skip = randomReplySkipReason(activity);
	if (skip) {
		onSkip?.(skip);
		return false;
	}
	return Math.random() * 100 < settings.randomResponseChance;
}
