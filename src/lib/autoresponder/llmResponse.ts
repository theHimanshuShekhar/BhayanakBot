import { callOllama } from "../ollama.js";

export async function generateAutoResponse(
	systemPrompt: string,
	triggerMessage: string,
	authorName: string,
	conversationContext?: string,
	numPredict = 160,
): Promise<string | null> {
	let prompt = conversationContext
		? `Recent conversation in this channel:\n${conversationContext}\n\n${authorName} just said: "${triggerMessage}"`
		: `${authorName} said: "${triggerMessage}"`;
	return callOllama(systemPrompt, prompt, 120_000, numPredict);
}

export async function generateMentionReply(
	systemPrompt: string,
	conversationContext: string,
	authorName: string,
	messageContent: string,
	numPredict = 200,
): Promise<string | null> {
	const prompt = [
		`You are ${systemPrompt || "a helpful Discord bot"}.`,
		`Recent conversation in this channel:`,
		conversationContext,
		`${authorName} just mentioned you: "${messageContent}"`,
		`Reply naturally as part of the conversation. Keep it concise (1-3 sentences).`,
	].join("\n\n");
	return callOllama("", prompt, 120_000, numPredict);
}

export async function generateChatResponse(
	systemPrompt: string,
	conversationContext: string,
	authorName: string,
	messageContent: string,
	numPredict = 300,
): Promise<string | null> {
	const prompt = [
		`You are ${systemPrompt || "a helpful Discord bot"}.`,
		`Recent conversation:`,
		conversationContext,
		`${authorName} says: "${messageContent}"`,
		`Reply helpfully and naturally.`,
	].join("\n\n");
	return callOllama("", prompt, 120_000, numPredict);
}
