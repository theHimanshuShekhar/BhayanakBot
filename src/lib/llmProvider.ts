import { callOllama, callOllamaLowPriority } from "./ollama.js";

const DEFAULT_ZEN_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_ZEN_MODEL = "deepseek-v4-flash";
const DEFAULT_ZEN_TIMEOUT_MS = 15_000;
const MIN_ZEN_TIMEOUT_MS = 1000;

type ZenChatResponse = {
	choices?: Array<{ message?: { content?: string | null } }>;
};

type LlmMode = "interactive" | "background";
type ZenFailureReason = "not_configured" | "privacy_disabled" | "http_error" | "fetch_error" | "empty" | "refusal";

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

function resolveZenTimeoutMs(totalTimeoutMs: number): number {
	const configuredTimeoutMs = Number.parseInt(process.env.ZEN_TIMEOUT_MS ?? "", 10);
	const providerTimeoutMs =
		Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= MIN_ZEN_TIMEOUT_MS
			? configuredTimeoutMs
			: DEFAULT_ZEN_TIMEOUT_MS;
	return Math.min(totalTimeoutMs, providerTimeoutMs);
}

async function callZenChat(
	requestId: string,
	mode: LlmMode,
	label: string | undefined,
	system: string,
	prompt: string,
	timeoutMs: number,
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

	const baseUrl = (process.env.ZEN_BASE_URL ?? DEFAULT_ZEN_BASE_URL).replace(/\/$/, "");
	const model = process.env.ZEN_MODEL ?? DEFAULT_ZEN_MODEL;
	const controller = new AbortController();
	const zenTimeoutMs = resolveZenTimeoutMs(timeoutMs);
	const timeout = setTimeout(() => controller.abort(), zenTimeoutMs);
	logLlm(
		`request=${requestId} mode=${mode} label=${label ?? "none"} provider=zen event=start model=${model} host=${safeUrlHost(baseUrl)} timeoutMs=${zenTimeoutMs}`,
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
		const content = data.choices?.[0]?.message?.content?.trim() ?? "";
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
	label?: string,
): Promise<string | null> {
	const requestId = createRequestId();
	logLlm(`request=${requestId} mode=interactive label=${label ?? "none"} event=start timeoutMs=${timeoutMs}`);
	const zenResult = await callZenChat(requestId, "interactive", label, system, prompt, timeoutMs);
	if (zenResult.content) return zenResult.content;
	const remainingTimeoutMs = fallbackTimeout(timeoutMs, zenResult.elapsedMs);
	logLlm(
		`request=${requestId} mode=interactive label=${label ?? "none"} provider=ollama event=fallback reason=${zenResult.reason ?? "unknown"} timeoutMs=${remainingTimeoutMs}`,
	);
	const result = await callOllama(system, prompt, remainingTimeoutMs, numPredict);
	logLlm(
		`request=${requestId} mode=interactive label=${label ?? "none"} provider=ollama result=${result ? "success" : "failure"} outputLength=${result?.length ?? 0}`,
	);
	return result;
}

export async function callBackgroundLlm(
	system: string,
	prompt: string,
	timeoutMs = 3000,
	numPredict?: number,
	label?: string,
): Promise<string | null> {
	const requestId = createRequestId();
	logLlm(`request=${requestId} mode=background label=${label ?? "none"} event=start timeoutMs=${timeoutMs}`);
	const zenResult = await callZenChat(requestId, "background", label, system, prompt, timeoutMs);
	if (zenResult.content) return zenResult.content;
	const remainingTimeoutMs = fallbackTimeout(timeoutMs, zenResult.elapsedMs);
	logLlm(
		`request=${requestId} mode=background label=${label ?? "none"} provider=ollama event=fallback reason=${zenResult.reason ?? "unknown"} timeoutMs=${remainingTimeoutMs}`,
	);
	const result = await callOllamaLowPriority(system, prompt, remainingTimeoutMs, numPredict, label);
	logLlm(
		`request=${requestId} mode=background label=${label ?? "none"} provider=ollama result=${result ? "success" : "failure"} outputLength=${result?.length ?? 0}`,
	);
	return result;
}
