import { callOllama, callOllamaLowPriority } from "./ollama.js";

const DEFAULT_ZEN_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_ZEN_MODEL = "deepseek-v4-flash";

type ZenChatResponse = {
	choices?: Array<{ message?: { content?: string | null } }>;
};

async function callZenChat(
	system: string,
	prompt: string,
	timeoutMs: number,
): Promise<{ content: string | null; elapsedMs: number }> {
	const startedAt = Date.now();
	const apiKey = process.env.ZEN_API_KEY;
	if (!apiKey) return { content: null, elapsedMs: 0 };

	const baseUrl = (process.env.ZEN_BASE_URL ?? DEFAULT_ZEN_BASE_URL).replace(/\/$/, "");
	const model = process.env.ZEN_MODEL ?? DEFAULT_ZEN_MODEL;
	const controller = new AbortController();
	const zenTimeoutMs = Math.max(1000, Math.floor(timeoutMs / 2));
	const timeout = setTimeout(() => controller.abort(), zenTimeoutMs);

	try {
		const res = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: prompt },
				],
			}),
			signal: controller.signal,
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "(unreadable)");
			console.log(`[zen] chat completion failed: HTTP ${res.status} ${body.slice(0, 200)}`);
			return { content: null, elapsedMs: Date.now() - startedAt };
		}

		const data = (await res.json()) as ZenChatResponse;
		const content = data.choices?.[0]?.message?.content?.trim() ?? "";
		if (!content || isRefusalOnly(content)) return { content: null, elapsedMs: Date.now() - startedAt };
		return { content, elapsedMs: Date.now() - startedAt };
	} catch (err) {
		console.log(`[zen] chat completion error: ${err instanceof Error ? err.message : String(err)}`);
		return { content: null, elapsedMs: Date.now() - startedAt };
	} finally {
		clearTimeout(timeout);
	}
}

function isRefusalOnly(content: string): boolean {
	return /^(i can(?:not|['’]?t) (?:help|assist)(?: with that| with this| with that request| with this request)?|i am unable to|i['’]?m unable to)\b/i.test(
		content.trim(),
	);
}

function fallbackTimeout(timeoutMs: number, elapsedMs: number): number {
	return Math.max(1000, timeoutMs - elapsedMs);
}

export async function callInteractiveLlm(
	system: string,
	prompt: string,
	timeoutMs = 3000,
	numPredict?: number,
): Promise<string | null> {
	const zenResult = await callZenChat(system, prompt, timeoutMs);
	if (zenResult.content) return zenResult.content;
	return callOllama(system, prompt, fallbackTimeout(timeoutMs, zenResult.elapsedMs), numPredict);
}

export async function callBackgroundLlm(
	system: string,
	prompt: string,
	timeoutMs = 3000,
	numPredict?: number,
	label?: string,
): Promise<string | null> {
	const zenResult = await callZenChat(system, prompt, timeoutMs);
	if (zenResult.content) return zenResult.content;
	return callOllamaLowPriority(system, prompt, fallbackTimeout(timeoutMs, zenResult.elapsedMs), numPredict, label);
}
