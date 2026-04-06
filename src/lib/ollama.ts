const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "tinyllama";

export async function callOllama(system: string, prompt: string, timeoutMs = 3000): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				system,
				prompt,
				stream: false,
			}),
			signal: controller.signal,
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { response?: string };
		return data.response?.trim() || null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
