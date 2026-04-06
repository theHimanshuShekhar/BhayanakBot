const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

export async function ensureOllamaModel(): Promise<void> {
	console.log(`[ollama] Ensuring model ${OLLAMA_MODEL} is available...`);
	try {
		const res = await fetch(`${OLLAMA_URL}/api/pull`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: OLLAMA_MODEL, stream: false }),
		});
		if (!res.ok) {
			console.log(`[ollama] pull failed: HTTP ${res.status}`);
			return;
		}
		const data = (await res.json()) as { status?: string };
		console.log(`[ollama] pull status: ${data.status ?? "unknown"}`);
	} catch (err) {
		console.log(`[ollama] pull error: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export async function callOllama(system: string, prompt: string, timeoutMs = 3000): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	console.log(`[ollama] POST ${OLLAMA_URL}/api/generate model=${OLLAMA_MODEL} timeout=${timeoutMs}ms`);
	console.log(`[ollama] system="${system.slice(0, 80)}" prompt="${prompt.slice(0, 80)}"`);

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
		console.log(`[ollama] HTTP status=${res.status} ok=${res.ok}`);
		if (!res.ok) {
			const body = await res.text().catch(() => "(unreadable)");
			console.log(`[ollama] error body: ${body.slice(0, 200)}`);
			return null;
		}
		const data = (await res.json()) as { response?: string };
		console.log(`[ollama] raw response="${String(data.response).slice(0, 200)}"`);
		return data.response?.trim() || null;
	} catch (err) {
		console.log(`[ollama] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
