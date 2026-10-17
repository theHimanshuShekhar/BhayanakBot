import type { Message } from "discord.js";
import type { MatchResult } from "../../db/queries/autoResponses.js";

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

/**
 * Rolls the configured Random Reply chance once. Only the guild's `random-response-channel` and
 * `random-response-chance` decide it: a channel that is not configured, or a chance of 0, never fires.
 */
export function rollRandomReply(settings: RandomReplySettings, channelId: string): boolean {
	if (!settings.randomResponseChannelId || settings.randomResponseChance <= 0) return false;
	if (channelId !== settings.randomResponseChannelId) return false;
	return Math.random() * 100 < settings.randomResponseChance;
}
