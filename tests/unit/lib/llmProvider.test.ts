import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOllama, callOllamaLowPriority } from "../../../src/lib/ollama.js";

vi.mock("../../../src/lib/ollama.js", () => ({
	callOllama: vi.fn(async () => "ollama interactive fallback"),
	callOllamaLowPriority: vi.fn(async () => "ollama background fallback"),
}));

const originalEnv = { ...process.env };
const mockedFetch = vi.fn();
const mockedCallOllama = vi.mocked(callOllama);
const mockedCallOllamaLowPriority = vi.mocked(callOllamaLowPriority);

async function importProvider() {
	vi.resetModules();
	return import("../../../src/lib/llmProvider.js");
}

// LOCAL_LLM_ENABLED is currently false (src/lib/features.ts): the provider is
// remote-API only and must never reach Ollama, whatever happens with Zen.
describe("LLM provider", () => {
	beforeEach(() => {
		process.env = { ...originalEnv };
		process.env.ZEN_API_KEY = "zen-test-key";
		process.env.ZEN_ALLOW_DISCORD_CONTENT = "true";
		delete process.env.ZEN_BASE_URL;
		delete process.env.ZEN_MODEL;
		mockedFetch.mockReset();
		mockedCallOllama.mockClear();
		mockedCallOllamaLowPriority.mockClear();
		vi.stubGlobal("fetch", mockedFetch);
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("uses Zen chat completions when configured without forwarding token caps", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "zen generated reply" } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000, 123, "summarize");

		expect(result).toBe("zen generated reply");
		expect(mockedFetch).toHaveBeenCalledWith(
			"https://opencode.ai/zen/go/v1/chat/completions",
			expect.objectContaining({
				method: "POST",
				headers: { Authorization: "Bearer zen-test-key", "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "deepseek-v4-flash",
					messages: [
						{ role: "system", content: "System prompt" },
						{ role: "user", content: "User prompt" },
					],
				}),
			}),
		);
		expect(mockedCallOllama).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[llm] request="));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("mode=interactive"));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("label=summarize"));
		expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("User prompt"));
		logSpy.mockRestore();
	});

	it("returns null without contacting any provider when Discord content is not allowed", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		delete process.env.ZEN_ALLOW_DISCORD_CONTENT;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000, 123, "summarize");

		expect(result).toBeNull();
		expect(mockedFetch).not.toHaveBeenCalled();
		expect(mockedCallOllama).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=local-llm-disabled"));
		logSpy.mockRestore();
	});

	it("returns null without contacting any provider when Zen is not configured", async () => {
		delete process.env.ZEN_API_KEY;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000);

		expect(result).toBeNull();
		expect(mockedFetch).not.toHaveBeenCalled();
		expect(mockedCallOllama).not.toHaveBeenCalled();
	});

	it("returns null without an Ollama fallback when Zen returns an HTTP error", async () => {
		mockedFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "temporarily unavailable" });
		const { callBackgroundLlm } = await importProvider();

		const result = await callBackgroundLlm("System prompt", "User prompt", 90_000, undefined, "personality:user");

		expect(result).toBeNull();
		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
	});

	it("resolves null when Zen times out instead of falling back to Ollama", async () => {
		vi.useFakeTimers();
		process.env.ZEN_TIMEOUT_MS = "2000";
		const { promise, reject } = Promise.withResolvers<Response>();
		mockedFetch.mockImplementationOnce((_url, init) => {
			const signal = (init as RequestInit).signal;
			signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			return promise;
		});
		const { callBackgroundLlm } = await importProvider();

		const resultPromise = callBackgroundLlm("System prompt", "User prompt", 90_000, undefined, "personality:user");

		await vi.advanceTimersByTimeAsync(2000);
		await expect(resultPromise).resolves.toBeNull();
		expect(mockedCallOllamaLowPriority).not.toHaveBeenCalled();
	});

	it("returns null when Zen returns empty or refusal-only content", async () => {
		mockedFetch
			.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "   " } }] }) })
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ choices: [{ message: { content: "I can't help with that." } }] }),
			});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt")).toBeNull();
		expect(await callInteractiveLlm("System", "Prompt")).toBeNull();
		expect(mockedCallOllama).not.toHaveBeenCalled();
	});

	it("returns null for cannot-assist refusal wording", async () => {
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "I cannot assist with that request." } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt")).toBeNull();
		expect(mockedCallOllama).toHaveBeenCalledTimes(0);
	});
});
