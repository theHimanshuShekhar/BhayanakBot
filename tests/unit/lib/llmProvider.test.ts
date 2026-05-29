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

describe("LLM provider", () => {
	beforeEach(() => {
		process.env = { ...originalEnv };
		process.env.ZEN_API_KEY = "zen-test-key";
		delete process.env.ZEN_BASE_URL;
		delete process.env.ZEN_MODEL;
		mockedFetch.mockReset();
		mockedCallOllama.mockClear();
		mockedCallOllamaLowPriority.mockClear();
		vi.stubGlobal("fetch", mockedFetch);
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.unstubAllGlobals();
	});

	it("uses Zen chat completions when configured", async () => {
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "zen generated reply" } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000, 123);

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
					max_tokens: 123,
				}),
			}),
		);
		expect(mockedCallOllama).not.toHaveBeenCalled();
	});

	it("falls back to high-priority Ollama when Zen is not configured", async () => {
		delete process.env.ZEN_API_KEY;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", 12_000, 123);

		expect(result).toBe("ollama interactive fallback");
		expect(mockedFetch).not.toHaveBeenCalled();
		expect(mockedCallOllama).toHaveBeenCalledWith("System prompt", "User prompt", expect.any(Number), 123);
	});

	it("falls back to low-priority Ollama when Zen returns an HTTP error", async () => {
		mockedFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "temporarily unavailable" });
		const { callBackgroundLlm } = await importProvider();

		const result = await callBackgroundLlm("System prompt", "User prompt", 90_000, undefined, "profile label");

		expect(result).toBe("ollama background fallback");
		expect(mockedCallOllamaLowPriority).toHaveBeenCalledWith(
			"System prompt",
			"User prompt",
			expect.any(Number),
			undefined,
			"profile label",
		);
	});

	it("falls back when Zen returns empty or refusal-only content", async () => {
		mockedFetch
			.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "   " } }] }) })
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ choices: [{ message: { content: "I can't help with that." } }] }),
			});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt")).toBe("ollama interactive fallback");
		expect(await callInteractiveLlm("System", "Prompt")).toBe("ollama interactive fallback");
		expect(mockedCallOllama).toHaveBeenCalledTimes(2);
	});

	it("falls back for cannot-assist refusal wording", async () => {
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "I cannot assist with that request." } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt")).toBe("ollama interactive fallback");
		expect(mockedCallOllama).toHaveBeenCalledTimes(1);
	});
});
