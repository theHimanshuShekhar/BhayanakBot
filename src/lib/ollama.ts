const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e2b";

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

// Queue: Ollama is a single local instance — concurrent requests compete for GPU/CPU
// and can hang or fail. Serialize all generation calls so only one runs at a time.
type OllamaJob = {
	system: string;
	prompt: string;
	timeoutMs: number;
	numPredict: number | undefined;
	resolve: (value: string | null) => void;
};

const queue: OllamaJob[] = [];
let isRunning = false;

function enqueue(job: OllamaJob): void {
	queue.push(job);
	if (!isRunning) void processQueue();
}

async function processQueue(): Promise<void> {
	isRunning = true;
	while (queue.length > 0) {
		const job = queue.shift()!;
		const result = await callOllamaInternal(job.system, job.prompt, job.timeoutMs, job.numPredict);
		job.resolve(result);
	}
	isRunning = false;
}

async function callOllamaInternal(
	system: string,
	prompt: string,
	timeoutMs: number,
	numPredict: number | undefined,
): Promise<string | null> {
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
				...(numPredict !== undefined && { options: { num_predict: numPredict } }),
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

export async function callOllama(
	system: string,
	prompt: string,
	timeoutMs = 3000,
	numPredict?: number,
): Promise<string | null> {
	return new Promise((resolve) => {
		enqueue({ system, prompt, timeoutMs, numPredict, resolve });
	});
}
