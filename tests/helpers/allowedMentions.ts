import { MessagePayload } from "discord.js";
import { DEFAULT_ALLOWED_MENTIONS } from "../../src/lib/allowedMentions.js";

/**
 * The `allowed_mentions` Discord would receive for a send/reply argument, resolved by discord.js
 * itself against the bot's client-wide default. This is what decides who gets notified.
 */
export function resolveAllowedMentions(sendArg: string | { allowedMentions?: unknown }) {
	const options = typeof sendArg === "string" ? { content: sendArg } : sendArg;
	const target = { client: { options: { allowedMentions: DEFAULT_ALLOWED_MENTIONS } } };
	const payload = MessagePayload.create(target as never, options as never).resolveBody();
	return (payload.body as { allowed_mentions?: Record<string, unknown> }).allowed_mentions;
}

export const NOTIFIES_NOBODY = { parse: [], users: [], roles: [], replied_user: false };
