import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const mockedFetch = vi.fn();

async function importProvider() {
	vi.resetModules();
	return import("../../../src/lib/llmProvider.js");
}

// Zen is the only provider (ADR 0006): whatever happens with it, the answer is null, never a fallback.
describe("LLM provider", () => {
	beforeEach(() => {
		process.env = { ...originalEnv };
		process.env.ZEN_API_KEY = "zen-test-key";
		process.env.ZEN_ALLOW_DISCORD_CONTENT = "true";
		delete process.env.ZEN_BASE_URL;
		delete process.env.ZEN_MODEL;
		mockedFetch.mockReset();
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

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000, "summarize");

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
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[llm] request="));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("mode=interactive"));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("label=summarize"));
		expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("User prompt"));
		logSpy.mockRestore();
	});

	it("returns null without contacting Zen when Discord content is not allowed", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		delete process.env.ZEN_ALLOW_DISCORD_CONTENT;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000, "summarize");

		expect(result).toBeNull();
		expect(mockedFetch).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=privacy_disabled"));
		logSpy.mockRestore();
	});

	it("returns null without contacting Zen when Zen is not configured", async () => {
		delete process.env.ZEN_API_KEY;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000);

		expect(result).toBeNull();
		expect(mockedFetch).not.toHaveBeenCalled();
	});

	it("returns null when Zen returns an HTTP error", async () => {
		mockedFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "temporarily unavailable" });
		const { callBackgroundLlm } = await importProvider();

		const result = await callBackgroundLlm("System prompt", "User prompt", 90_000, "personality:user");

		expect(result).toBeNull();
	});

	it("returns null when the Zen request fails with a network error", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		mockedFetch.mockRejectedValueOnce(new TypeError("fetch failed"));
		const { callInteractiveLlm } = await importProvider();

		await expect(callInteractiveLlm("System prompt", "User prompt")).resolves.toBeNull();
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=fetch_error"));
		logSpy.mockRestore();
	});

	it("resolves null when Zen times out", async () => {
		vi.useFakeTimers();
		process.env.ZEN_TIMEOUT_MS = "2000";
		const { promise, reject } = Promise.withResolvers<Response>();
		mockedFetch.mockImplementationOnce((_url, init) => {
			const signal = (init as RequestInit).signal;
			signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			return promise;
		});
		const { callBackgroundLlm } = await importProvider();

		const resultPromise = callBackgroundLlm("System prompt", "User prompt", 90_000, "personality:user");

		await vi.advanceTimersByTimeAsync(2000);
		await expect(resultPromise).resolves.toBeNull();
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
	});

	it("returns null for cannot-assist refusal wording", async () => {
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "I cannot assist with that request." } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt")).toBeNull();
	});
});
