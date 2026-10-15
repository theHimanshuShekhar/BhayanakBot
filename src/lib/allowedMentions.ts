import type { MessageMentionOptions } from "discord.js";

/** Mention Policy default: bot messages notify nobody and never reply-ping the author. */
export const DEFAULT_ALLOWED_MENTIONS: MessageMentionOptions = {
	parse: [],
	users: [],
	roles: [],
	repliedUser: false,
};

/** Per-send opt-in for features that exist to reach specific members. Never mass or role mentions. */
export function notifyOnly(userIds: readonly string[]): MessageMentionOptions {
	return { ...DEFAULT_ALLOWED_MENTIONS, users: [...userIds] };
}
