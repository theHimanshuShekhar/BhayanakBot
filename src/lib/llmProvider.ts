import { envOr } from "./env.js";

const DEFAULT_ZEN_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
const DEFAULT_ZEN_MODEL = "deepseek-v4.1-flash";
const DEFAULT_ZEN_BACKUP_MODEL = "glm-5.3-flash";
// The runtime image has no package.json to read a version from.
const USER_AGENT = "bhayanakbot/1.0.0";
const MIN_ZEN_TIMEOUT_MS = 1000;
const MAX_CONCURRENT_ZEN_REQUESTS = 3;
const MAX_QUEUED_ZEN_REQUESTS = 6;

// What each kind of Zen call may cost. Callers pick a mode; they never pass raw numbers.
// ZEN_MODEL may be a reasoning model, whose reasoning tokens count toward max_tokens on OpenAI-compatible endpoints.
// The limits leave headroom for that reasoning; a tighter cap would truncate most replies, which are dropped as no reply.
// backupMaxTokens, when set, replaces maxTokens for the Backup Model's attempt: personality builds that the Primary
// Model's content filter rejects fall to the Backup Model, which can spend all of 8,000 tokens on reasoning alone.
// The timeout applies to each attempt.
type LlmBudget = { maxTokens: number; backupMaxTokens?: number; timeoutMs: number };

export const LLM_BUDGETS = {
	chat: { maxTokens: 1500, timeoutMs: 30_000 },
	summary: { maxTokens: 4000, timeoutMs: 120_000 },
	personality: { maxTokens: 8000, backupMaxTokens: 16_000, timeoutMs: 180_000 },
} as const satisfies Record<string, LlmBudget>;

export type LlmMode = keyof typeof LLM_BUDGETS;
type LlmPriority = "interactive" | "background";

type ZenChatResponse = {
	choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
};

export type ZenFailureReason =
	| "not_configured"
	| "privacy_disabled"
	| "queue_full"
	| "http_error"
	| "fetch_error"
	| "empty"
	| "truncated"
	| "content_filter"
	| "refusal";

// `session` names one conversation and is sent as x-opencode-session (Zen Go rejects requests without it).
export type LlmCallOptions = { session: string; label?: string };

type ZenResult = {
	content: string | null;
	elapsedMs: number;
	reason?: ZenFailureReason;
};

/** A request's final outcome: success, or the reason of the last attempt (the Backup Model's when it was tried). */
export type LlmOutcome = { ok: true } | { ok: false; reason: ZenFailureReason };

let outcomeObserver: ((outcome: LlmOutcome) => void) | null = null;

/** Registers the one observer told about every request's final outcome (AI Outage alerting). Null removes it. */
export function setLlmOutcomeObserver(observer: ((outcome: LlmOutcome) => void) | null): void {
	outcomeObserver = observer;
}

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

type Attempt = "primary" | "backup";

// One request to one model. Logs the outcome (never the content) and releases nothing: the caller holds the slot.
async function attemptZenChat(
	requestId: string,
	attempt: Attempt,
	model: string,
	apiKey: string,
	baseUrl: string,
	mode: LlmMode,
	session: string,
	system: string,
	prompt: string,
): Promise<ZenResult> {
	const startedAt = Date.now();
	const budget: LlmBudget = LLM_BUDGETS[mode];
	const maxTokens = attempt === "backup" ? (budget.backupMaxTokens ?? budget.maxTokens) : budget.maxTokens;
	const zenTimeoutMs = resolveZenTimeoutMs(mode);
	const prefix = `request=${requestId} attempt=${attempt} model=${model} mode=${mode} provider=zen host=${safeUrlHost(baseUrl)} timeoutMs=${zenTimeoutMs} maxTokens=${maxTokens}`;
	const fail = (reason: ZenFailureReason, extra = ""): ZenResult => {
		const elapsedMs = Date.now() - startedAt;
		logLlm(`${prefix} result=failure reason=${reason}${extra} elapsedMs=${elapsedMs}`);
		return { content: null, elapsedMs, reason };
	};
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), zenTimeoutMs);

	try {
		const res = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
				"x-opencode-session": session,
			},
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

		if (!res.ok) return fail("http_error", ` status=${res.status}`);

		const data = (await res.json()) as ZenChatResponse;
		const choice = data.choices?.[0];
		const content = choice?.message?.content?.trim() ?? "";
		// Zen's provider-side content filter answers 200 with finish_reason "content_filter" and no content. Checked
		// first so it is never logged as "empty"; the Backup Model, which filters differently, gets its attempt.
		if (choice?.finish_reason === "content_filter") return fail("content_filter");
		// Cut off by the token limit: the text ends mid-thought (or reasoning used every token and left none), so it is
		// never posted or stored. Checked before "empty" so the two failures stay distinguishable in the logs.
		if (choice?.finish_reason === "length") return fail("truncated", ` outputLength=${content.length}`);
		if (!content) return fail("empty");
		if (isRefusalOnly(content)) return fail("refusal");
		const elapsedMs = Date.now() - startedAt;
		logLlm(`${prefix} result=success elapsedMs=${elapsedMs} outputLength=${content.length}`);
		return { content, elapsedMs };
	} catch (err) {
		return fail("fetch_error", ` error=${err instanceof Error ? err.name : "unknown"}`);
	} finally {
		clearTimeout(timeout);
	}
}

async function callZenChat(
	requestId: string,
	mode: LlmMode,
	priority: LlmPriority,
	options: LlmCallOptions,
	system: string,
	prompt: string,
): Promise<ZenResult> {
	const startedAt = Date.now();
	const label = options.label ?? "none";
	const apiKey = process.env.ZEN_API_KEY;
	if (!apiKey) {
		logLlm(`request=${requestId} mode=${mode} label=${label} provider=zen result=skipped reason=not_configured`);
		return { content: null, elapsedMs: 0, reason: "not_configured" };
	}

	if (!isExternalDiscordContentAllowed()) {
		logLlm(`request=${requestId} mode=${mode} label=${label} provider=zen result=skipped reason=privacy_disabled`);
		return { content: null, elapsedMs: 0, reason: "privacy_disabled" };
	}

	const release = await acquireSlot(priority);
	if (!release) {
		logLlm(
			`request=${requestId} mode=${mode} priority=${priority} label=${label} provider=zen result=dropped reason=queue_full`,
		);
		return { content: null, elapsedMs: Date.now() - startedAt, reason: "queue_full" };
	}

	try {
		const baseUrl = envOr("ZEN_BASE_URL", DEFAULT_ZEN_BASE_URL).replace(/\/$/, "");
		const primaryModel = envOr("ZEN_MODEL", DEFAULT_ZEN_MODEL);
		const backupModel = envOr("ZEN_BACKUP_MODEL", DEFAULT_ZEN_BACKUP_MODEL);
		const run = (attempt: Attempt, model: string) =>
			attemptZenChat(requestId, attempt, model, apiKey, baseUrl, mode, options.session, system, prompt);

		const primary = await run("primary", primaryModel);
		// Every failure that reaches this point (HTTP, network or timeout, empty, truncated, content
		// filtered, refusal) earns the Backup
		// Model one attempt in the same slot. A backup equal to the primary would only repeat the failure.
		if (primary.content !== null || backupModel === primaryModel) return primary;
		return await run("backup", backupModel);
	} finally {
		release();
	}
}

// A refusal is the whole reply: a short "I can't help with that." Replies that merely start that way are posted.
const REFUSAL_PATTERN =
	/^(?:(?:i['’]?m sorry|i am sorry|sorry),?\s*(?:but\s+)?)?i\s*(?:can(?:not|['’]?t)|am unable to|['’]?m unable to)\s+(?:help|assist)(?:\s+you)?(?:\s+with\s+(?:that|this)(?:\s+request)?)?\s*[.!]?$/i;

function isRefusalOnly(content: string): boolean {
	return REFUSAL_PATTERN.test(content.trim());
}

// Interactive calls answer a person who is waiting; background calls (random replies, personality builds) are the
// first to be dropped when Zen is saturated.
export async function callInteractiveLlm(
	system: string,
	prompt: string,
	mode: LlmMode,
	options: LlmCallOptions,
): Promise<string | null> {
	return callLlm("interactive", system, prompt, mode, options);
}

export async function callBackgroundLlm(
	system: string,
	prompt: string,
	mode: LlmMode,
	options: LlmCallOptions,
): Promise<string | null> {
	return callLlm("background", system, prompt, mode, options);
}

async function callLlm(
	priority: LlmPriority,
	system: string,
	prompt: string,
	mode: LlmMode,
	options: LlmCallOptions,
): Promise<string | null> {
	const requestId = createRequestId();
	logLlm(
		`request=${requestId} mode=${mode} priority=${priority} label=${options.label ?? "none"} session=${options.session} event=start`,
	);
	const zenResult = await callZenChat(requestId, mode, priority, options, system, prompt);
	try {
		outcomeObserver?.(zenResult.content !== null ? { ok: true } : { ok: false, reason: zenResult.reason ?? "empty" });
	} catch {
		// An observer must never break the caller's reply.
	}
	return zenResult.content;
}
