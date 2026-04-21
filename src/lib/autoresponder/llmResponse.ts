import { callOllama } from "../ollama.js";

export async function generateAutoResponse(
	systemPrompt: string,
	triggerMessage: string,
	authorName: string,
	numPredict = 160,
): Promise<string | null> {
	const prompt = `${authorName} said: "${triggerMessage}"`;
	return callOllama(systemPrompt, prompt, 120_000, numPredict);
}
