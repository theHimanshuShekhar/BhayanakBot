import { callInteractiveLlm } from "../llmProvider.js";

export async function generateAutoResponse(
	systemPrompt: string,
	triggerMessage: string,
	authorName: string,
	session: string,
	conversationContext?: string,
): Promise<string | null> {
	const prompt = conversationContext
		? `Recent conversation in this channel:\n${conversationContext}\n\n${authorName} just said: "${triggerMessage}"`
		: `${authorName} said: "${triggerMessage}"`;
	return callInteractiveLlm(systemPrompt, prompt, "chat", { session, label: "autoresponder:auto-response" });
}

export async function generateMentionReply(
	systemPrompt: string,
	conversationContext: string,
	authorName: string,
	messageContent: string,
	session: string,
): Promise<string | null> {
	const prompt = [
		`You are ${systemPrompt || "a savage Discord bot who roasts everyone"}.`,
		`Recent conversation in this channel:`,
		conversationContext,
		`${authorName} just mentioned you: "${messageContent}"`,
		`Reply as part of the conversation with a joke or playful roast. Keep it concise (1-3 sentences). Avoid genuine hostility.`,
	].join("\n\n");
	return callInteractiveLlm("", prompt, "chat", { session, label: "autoresponder:mention-reply" });
}

export async function generateChatResponse(
	systemPrompt: string,
	conversationContext: string,
	authorName: string,
	messageContent: string,
	session: string,
): Promise<string | null> {
	const prompt = [
		`You are ${systemPrompt || "a savage Discord bot who roasts everyone"}.`,
		`Recent conversation:`,
		conversationContext,
		`${authorName} says: "${messageContent}"`,
		`Reply naturally with a joke or playful roast. Keep it funny, not hostile.`,
	].join("\n\n");
	return callInteractiveLlm("", prompt, "chat", { session, label: "autoresponder:chat-response" });
}
