import { container } from "@sapphire/framework";
import type { Message } from "discord.js";

/** Discord rejects messages over 2000 characters; replies stop a little short of it. */
const REPLY_CAP = 1990;
// A typing indicator lasts about 10 seconds, so a long generation refreshes it.
const TYPING_REFRESH_MS = 8_000;

/** The one place a reply is cut to fit Discord's message limit. */
export function capReply(text: string): string {
	return text.length > REPLY_CAP ? `${text.slice(0, REPLY_CAP - 1)}…` : text;
}

export async function sendTyping(message: Message<true>): Promise<void> {
	await message.channel.sendTyping().catch(() => null);
}

/** Shows typing in the message's channel for as long as `work` runs. */
export async function whileTyping<T>(message: Message<true>, work: () => Promise<T>): Promise<T> {
	void sendTyping(message);
	const timer = setInterval(() => void sendTyping(message), TYPING_REFRESH_MS);
	try {
		return await work();
	} finally {
		clearInterval(timer);
	}
}

/**
 * Posts `text` (capped) as a reply to `message`, or as a plain channel message when `asReply` is false
 * (the trigger was deleted, so there is nothing to reply to). Returns true only when it was sent.
 */
export async function postReply(message: Message<true>, text: string, asReply: boolean): Promise<boolean> {
	const capped = capReply(text);
	if (capped.length !== text.length) {
		container.logger.warn(`[reply] truncated from ${text.length} to ${capped.length} chars`);
	}
	try {
		if (asReply) await message.reply(capped);
		else await message.channel.send(capped);
	} catch (err) {
		container.logger.warn(`[reply] send failed message=${message.id}:`, err);
		return false;
	}
	return true;
}
