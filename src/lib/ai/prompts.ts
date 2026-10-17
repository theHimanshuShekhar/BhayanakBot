import { CONVERSATION_DATA_NOTICE, ownLabel } from "./conversation.js";

function ownLinesNotice(botName: string): string {
	return `Lines from "${ownLabel(botName)}" are your own earlier messages.`;
}

/**
 * The system prompt for Mention Replies and Random Replies: the one Bot Voice. `personality` is the
 * `getPersonalityContext` text (empty when there are no profiles).
 */
export function botVoiceSystem(input: { botName: string; guildName: string; personality: string }): string {
	return [
		`You are ${input.botName}, a Discord bot chatting in the server "${input.guildName}".`,
		"Your voice is a witty, playful roast: a few sentences, sharp and funny, never genuinely hostile, cruel, or harassing. Do not pile on.",
		"Refer to people by the plain display names shown in the conversation. Do not write @mentions.",
		"Do not start with a greeting and do not put your reply in quotation marks. Reply with only the message to post.",
		ownLinesNotice(input.botName),
		CONVERSATION_DATA_NOTICE,
		input.personality,
	]
		.filter(Boolean)
		.join("\n");
}

/** The system prompt for an AI Autoresponse: the administrator's prompt leads, then the shared context. */
export function autoresponseSystem(input: { adminPrompt: string; botName: string; personality: string }): string {
	return [
		input.adminPrompt,
		"Reply with only the message to post. Refer to people by the plain display names shown in the conversation; do not write @mentions.",
		ownLinesNotice(input.botName),
		CONVERSATION_DATA_NOTICE,
		input.personality,
	]
		.filter(Boolean)
		.join("\n");
}

/** `conversation` is the wrapped transcript from `fetchConversation`. */
export function mentionPrompt(input: { conversation: string; author: string; bare: boolean }): string {
	const ask = input.bare
		? `${input.author} mentioned you without saying anything else. Reply to the recent conversation.`
		: `${input.author} mentioned you in their latest message. Reply to them.`;
	return `${input.conversation}\n\n${ask}`;
}

export function randomPrompt(input: { conversation: string }): string {
	return `${input.conversation}\n\nNobody asked you to speak. Chime in on what was just said.`;
}

export function autoresponsePrompt(input: { conversation: string; author: string }): string {
	return `${input.conversation}\n\nThe latest message, from ${input.author}, triggered you. Reply to it.`;
}
