import { envOr } from "./env.js";

const DEFAULT_ZEN_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_ZEN_MODEL = "deepseek-v4-flash";
const MIN_ZEN_TIMEOUT_MS = 1000;
const MAX_CONCURRENT_ZEN_REQUESTS = 3;
const MAX_QUEUED_ZEN_REQUESTS = 6;

// What each kind of Zen call may cost. Callers pick a mode; they never pass raw numbers.
// ZEN_MODEL may be a reasoning model, whose reasoning tokens count toward max_tokens on OpenAI-compatible endpoints.
// The limits leave headroom for that reasoning; a tighter cap would truncate most replies, which are dropped as no reply.
export const LLM_BUDGETS = {
	chat: { maxTokens: 1500, timeoutMs: 30_000 },
	summary: { maxTokens: 4000, timeoutMs: 120_000 },
	personality: { maxTokens: 4000, timeoutMs: 180_000 },
} as const;

export type LlmMode = keyof typeof LLM_BUDGETS;
type LlmPriority = "interactive" | "background";

type ZenChatResponse = {
	choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
};

type ZenFailureReason =
	| "not_configured"
	| "privacy_disabled"
	| "queue_full"
	| "http_error"
	| "fetch_error"
	| "empty"
	| "truncated"
	| "refusal";

type ZenResult = {
	content: string | null;
	elapsedMs: number;
	reason?: ZenFailureReason;
};

let nextRequestId = 1;

function createRequestId(): string {
	return `llm-${nextRequestId++}`;
}

function safeUrlHost(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return "invalid-url";
	}
}

function logLlm(message: string): void {
	console.log(`[llm] ${message}`);
}

function isExternalDiscordContentAllowed(): boolean {
	return process.env.ZEN_ALLOW_DISCORD_CONTENT === "true";
}

// ZEN_TIMEOUT_MS tunes the chat budget only; summaries and personality builds keep their own timeouts.
function resolveZenTimeoutMs(mode: LlmMode): number {
	if (mode !== "chat") return LLM_BUDGETS[mode].timeoutMs;
	const configuredTimeoutMs = Number.parseInt(process.env.ZEN_TIMEOUT_MS ?? "", 10);
	return Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= MIN_ZEN_TIMEOUT_MS
		? configuredTimeoutMs
		: LLM_BUDGETS.chat.timeoutMs;
}

type QueuedRequest = { priority: LlmPriority; start: (release: (() => void) | null) => void };

let inFlight = 0;
const queue: QueuedRequest[] = [];

function releaseSlot(): void {
	inFlight--;
	// Interactive work is served before background work; FIFO within a priority.
	const nextIndex = queue.findIndex((entry) => entry.priority === "interactive");
	const [next] = queue.splice(nextIndex === -1 ? 0 : nextIndex, 1);
	if (next) {
		inFlight++;
		next.start(releaseSlot);
	}
}

// Resolves to a release function once a slot is free, or null when the request was dropped because the queue is full.
// A full queue sheds background work first: an interactive request evicts the newest queued background one.
function acquireSlot(priority: LlmPriority): Promise<(() => void) | null> {
	if (inFlight < MAX_CONCURRENT_ZEN_REQUESTS) {
		inFlight++;
		return Promise.resolve(releaseSlot);
	}
	if (queue.length >= MAX_QUEUED_ZEN_REQUESTS) {
		const evicted =
			priority === "interactive" ? queue.filter((entry) => entry.priority === "background").at(-1) : undefined;
		if (!evicted) return Promise.resolve(null);
		queue.splice(queue.indexOf(evicted), 1);
		evicted.start(null);
	}
	return new Promise((resolve) => {
		queue.push({ priority, start: resolve });
	});
}

async function callZenChat(
	requestId: string,
	mode: LlmMode,
	priority: LlmPriority,
	label: string | undefined,
	system: string,
	prompt: string,
): Promise<ZenResult> {
	const startedAt = Date.now();
	const apiKey = process.env.ZEN_API_KEY;
	if (!apiKey) {
		logLlm(
			`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=skipped reason=not_configured`,
		);
		return { content: null, elapsedMs: 0, reason: "not_configured" };
	}

	if (!isExternalDiscordContentAllowed()) {
		logLlm(
			`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=skipped reason=privacy_disabled`,
		);
		return { content: null, elapsedMs: 0, reason: "privacy_disabled" };
	}

	const release = await acquireSlot(priority);
	if (!release) {
		logLlm(
			`request=${requestId} mode=${mode} priority=${priority} label=${label ?? "none"} provider=zen result=dropped reason=queue_full`,
		);
		return { content: null, elapsedMs: Date.now() - startedAt, reason: "queue_full" };
	}

	const baseUrl = envOr("ZEN_BASE_URL", DEFAULT_ZEN_BASE_URL).replace(/\/$/, "");
	const model = envOr("ZEN_MODEL", DEFAULT_ZEN_MODEL);
	const { maxTokens } = LLM_BUDGETS[mode];
	const controller = new AbortController();
	const zenTimeoutMs = resolveZenTimeoutMs(mode);
	const timeout = setTimeout(() => controller.abort(), zenTimeoutMs);
	logLlm(
		`request=${requestId} mode=${mode} priority=${priority} label=${label ?? "none"} provider=zen event=start model=${model} host=${safeUrlHost(baseUrl)} timeoutMs=${zenTimeoutMs} maxTokens=${maxTokens}`,
	);

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
				max_tokens: maxTokens,
			}),
			signal: controller.signal,
		});

		if (!res.ok) {
			logLlm(
				`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=failure reason=http_error status=${res.status} elapsedMs=${Date.now() - startedAt}`,
			);
			return { content: null, elapsedMs: Date.now() - startedAt, reason: "http_error" };
		}

		const data = (await res.json()) as ZenChatResponse;
		const choice = data.choices?.[0];
		const content = choice?.message?.content?.trim() ?? "";
		// Cut off by the token limit: the text ends mid-thought (or reasoning used every token and left none), so it is
		// never posted or stored. Checked before "empty" so the two failures stay distinguishable in the logs.
		if (choice?.finish_reason === "length") {
			logLlm(
				`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=failure reason=truncated elapsedMs=${Date.now() - startedAt} outputLength=${content.length}`,
			);
			return { content: null, elapsedMs: Date.now() - startedAt, reason: "truncated" };
		}
		if (!content) {
			logLlm(
				`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=failure reason=empty elapsedMs=${Date.now() - startedAt}`,
			);
			return { content: null, elapsedMs: Date.now() - startedAt, reason: "empty" };
		}
		if (isRefusalOnly(content)) {
			logLlm(
				`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=failure reason=refusal elapsedMs=${Date.now() - startedAt}`,
			);
			return { content: null, elapsedMs: Date.now() - startedAt, reason: "refusal" };
		}
		logLlm(
			`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=success elapsedMs=${Date.now() - startedAt} outputLength=${content.length}`,
		);
		return { content, elapsedMs: Date.now() - startedAt };
	} catch (err) {
		logLlm(
			`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen result=failure reason=fetch_error error=${err instanceof Error ? err.name : "unknown"} elapsedMs=${Date.now() - startedAt}`,
		);
		return { content: null, elapsedMs: Date.now() - startedAt, reason: "fetch_error" };
	} finally {
		clearTimeout(timeout);
		release();
	}
}

function isRefusalOnly(content: string): boolean {
	return /^(i can(?:not|['’]?t) (?:help|assist)(?: with that| with this| with that request| with this request)?|i am unable to|i['’]?m unable to)\b/i.test(
		content.trim(),
	);
}

// Interactive calls answer a person who is waiting; background calls (random replies, personality builds) are the
// first to be dropped when Zen is saturated.
export async function callInteractiveLlm(
	system: string,
	prompt: string,
	mode: LlmMode,
	label?: string,
): Promise<string | null> {
	const requestId = createRequestId();
	logLlm(`request=${requestId} mode=${mode} priority=interactive label=${label ?? "none"} event=start`);
	const zenResult = await callZenChat(requestId, mode, "interactive", label, system, prompt);
	return zenResult.content;
}

export async function callBackgroundLlm(
	system: string,
	prompt: string,
	mode: LlmMode,
	label?: string,
): Promise<string | null> {
	const requestId = createRequestId();
	logLlm(`request=${requestId} mode=${mode} priority=background label=${label ?? "none"} event=start`);
	const zenResult = await callZenChat(requestId, mode, "background", label, system, prompt);
	return zenResult.content;
}
