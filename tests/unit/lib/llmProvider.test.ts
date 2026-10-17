import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const mockedFetch = vi.fn();

async function importProvider() {
	vi.resetModules();
	return import("../../../src/lib/llmProvider.js");
}

function okReply(content = "reply", finishReason = "stop") {
	return { ok: true, json: async () => ({ choices: [{ message: { content }, finish_reason: finishReason }] }) };
}

function sentBody(callIndex = 0): { model: string; max_tokens: number; messages: Array<{ content: string }> } {
	return JSON.parse((mockedFetch.mock.calls[callIndex]?.[1] as RequestInit).body as string);
}

// Zen is the only provider (ADR 0006): whatever happens with it, the answer is null, never a fallback.
describe("LLM provider", () => {
	beforeEach(() => {
		process.env = { ...originalEnv };
		process.env.ZEN_API_KEY = "zen-test-key";
		process.env.ZEN_ALLOW_DISCORD_CONTENT = "true";
		delete process.env.ZEN_BASE_URL;
		delete process.env.ZEN_MODEL;
		delete process.env.ZEN_TIMEOUT_MS;
		// A Backup Model equal to the Primary Model is never tried; the "backup model" tests turn it back on.
		process.env.ZEN_BACKUP_MODEL = "deepseek-v4.1-flash";
		mockedFetch.mockReset();
		vi.stubGlobal("fetch", mockedFetch);
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("uses Zen chat completions when configured, sending the mode's output-token limit", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "zen generated reply" } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", "summary", {
			session: "test:1",
			label: "summarize",
		});

		expect(result).toBe("zen generated reply");
		expect(mockedFetch).toHaveBeenCalledWith(
			"https://opencode.ai/inference/go/openai/v1/chat/completions",
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: "Bearer zen-test-key",
					"Content-Type": "application/json",
					"User-Agent": "bhayanakbot/1.0.0",
					"x-opencode-session": "test:1",
				},
				body: JSON.stringify({
					model: "deepseek-v4.1-flash",
					messages: [
						{ role: "system", content: "System prompt" },
						{ role: "user", content: "User prompt" },
					],
					max_tokens: 4000,
				}),
			}),
		);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[llm] request="));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("priority=interactive"));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("label=summarize"));
		expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("User prompt"));
	});

	it("uses the default Zen base URL and model when they are blank", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		process.env.ZEN_BASE_URL = "";
		process.env.ZEN_MODEL = "  ";
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "zen generated reply" } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		await callInteractiveLlm("System prompt", "User prompt", "summary", { session: "test:1", label: "summarize" });

		expect(mockedFetch).toHaveBeenCalledWith(
			"https://opencode.ai/inference/go/openai/v1/chat/completions",
			expect.objectContaining({ body: expect.stringContaining('"model":"deepseek-v4.1-flash"') }),
		);
		logSpy.mockRestore();
	});

	it("returns null without contacting Zen when Discord content is not allowed", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		delete process.env.ZEN_ALLOW_DISCORD_CONTENT;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", "summary", {
			session: "test:1",
			label: "summarize",
		});

		expect(result).toBeNull();
		expect(mockedFetch).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=privacy_disabled"));
	});

	it("returns null without contacting Zen when Zen is not configured", async () => {
		delete process.env.ZEN_API_KEY;
		const { callInteractiveLlm } = await importProvider();

		const result = await callInteractiveLlm("System prompt", "User prompt", "chat", { session: "test:1" });

		expect(result).toBeNull();
		expect(mockedFetch).not.toHaveBeenCalled();
	});

	it("returns null when Zen returns an HTTP error", async () => {
		mockedFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "temporarily unavailable" });
		const { callBackgroundLlm } = await importProvider();

		const result = await callBackgroundLlm("System prompt", "User prompt", "personality", {
			session: "test:1",
			label: "personality:user",
		});

		expect(result).toBeNull();
	});

	it("returns null when the Zen request fails with a network error", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		mockedFetch.mockRejectedValueOnce(new TypeError("fetch failed"));
		const { callInteractiveLlm } = await importProvider();

		await expect(callInteractiveLlm("System prompt", "User prompt", "chat", { session: "test:1" })).resolves.toBeNull();
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=fetch_error"));
	});

	it("returns null when Zen returns empty or refusal-only content", async () => {
		mockedFetch
			.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "   " } }] }) })
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ choices: [{ message: { content: "I can't help with that." } }] }),
			});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt", "chat", { session: "test:1" })).toBeNull();
		expect(await callInteractiveLlm("System", "Prompt", "chat", { session: "test:1" })).toBeNull();
	});

	it("returns null for cannot-assist refusal wording", async () => {
		mockedFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "I cannot assist with that request." } }] }),
		});
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("System", "Prompt", "chat", { session: "test:1" })).toBeNull();
	});

	it("sends the caller's session as x-opencode-session so Zen can group one conversation", async () => {
		mockedFetch.mockResolvedValue(okReply());
		const { callInteractiveLlm, callBackgroundLlm } = await importProvider();

		await callInteractiveLlm("S", "P", "chat", { session: "mention:channel-1" });
		await callBackgroundLlm("S", "P", "personality", { session: "profile:guild:guild-1" });

		const headersOf = (i: number) => (mockedFetch.mock.calls[i]?.[1] as RequestInit).headers as Record<string, string>;
		expect(headersOf(0)["x-opencode-session"]).toBe("mention:channel-1");
		expect(headersOf(1)["x-opencode-session"]).toBe("profile:guild:guild-1");
		expect(headersOf(0)["User-Agent"]).toBe("bhayanakbot/1.0.0");
	});

	it("posts a reply that only starts like a refusal", async () => {
		mockedFetch
			.mockResolvedValueOnce(okReply("I can't help but notice your code is held together with duct tape."))
			.mockResolvedValueOnce(okReply("I am unable to stop laughing at this one."));
		const { callInteractiveLlm } = await importProvider();

		expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBe(
			"I can't help but notice your code is held together with duct tape.",
		);
		expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBe(
			"I am unable to stop laughing at this one.",
		);
	});

	it("treats common whole-message refusals as refusals", async () => {
		const refusals = [
			"I can't help with that.",
			"I cannot assist with that request.",
			"I'm unable to help with this.",
			"Sorry, I can't assist with that.",
			"I'm sorry, but I can't help with that request.",
		];
		for (const refusal of refusals) mockedFetch.mockResolvedValueOnce(okReply(refusal));
		const { callInteractiveLlm } = await importProvider();

		for (const refusal of refusals) {
			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" }), refusal).toBeNull();
		}
	});

	describe("backup model", () => {
		beforeEach(() => {
			delete process.env.ZEN_BACKUP_MODEL;
		});

		const modelOf = (i: number) => sentBody(i).model;

		it("retries once on the backup model when the primary fails or refuses", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			const failures = [
				() => mockedFetch.mockResolvedValueOnce({ ok: false, status: 503 }),
				() => mockedFetch.mockRejectedValueOnce(new TypeError("fetch failed")),
				() => mockedFetch.mockResolvedValueOnce(okReply("")),
				() => mockedFetch.mockResolvedValueOnce(okReply("This stops mid-", "length")),
				() => mockedFetch.mockResolvedValueOnce(okReply("I can't help with that.")),
			];
			const { callInteractiveLlm } = await importProvider();

			for (const [i, fail] of failures.entries()) {
				fail();
				mockedFetch.mockResolvedValueOnce(okReply("backup reply"));
				expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBe("backup reply");
				expect(modelOf(i * 2)).toBe("deepseek-v4.1-flash");
				expect(modelOf(i * 2 + 1)).toBe("glm-5.3-flash");
			}
			expect(mockedFetch).toHaveBeenCalledTimes(failures.length * 2);
		});

		it("gives up after the backup also fails, without a third attempt", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockResolvedValue({ ok: false, status: 500 });
			const { callBackgroundLlm } = await importProvider();

			expect(await callBackgroundLlm("S", "P", "personality", { session: "test:1" })).toBeNull();
			expect(mockedFetch).toHaveBeenCalledTimes(2);
		});

		it("does not try the backup when the primary answers", async () => {
			mockedFetch.mockResolvedValueOnce(okReply("primary reply"));
			const { callInteractiveLlm } = await importProvider();

			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBe("primary reply");
			expect(mockedFetch).toHaveBeenCalledTimes(1);
		});

		it("never contacts either model when Zen is unconfigured or not allowed Discord content", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			const { callInteractiveLlm } = await importProvider();
			delete process.env.ZEN_ALLOW_DISCORD_CONTENT;
			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBeNull();
			process.env.ZEN_ALLOW_DISCORD_CONTENT = "true";
			delete process.env.ZEN_API_KEY;
			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBeNull();
			expect(mockedFetch).not.toHaveBeenCalled();
		});

		it("uses ZEN_MODEL and ZEN_BACKUP_MODEL when set", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			process.env.ZEN_MODEL = "kimi-k3";
			process.env.ZEN_BACKUP_MODEL = "glm-5.2";
			mockedFetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(okReply("ok"));
			const { callInteractiveLlm } = await importProvider();

			await callInteractiveLlm("S", "P", "chat", { session: "test:1" });
			expect(modelOf(0)).toBe("kimi-k3");
			expect(modelOf(1)).toBe("glm-5.2");
		});

		it("gives each attempt the mode's full timeout", async () => {
			vi.useFakeTimers();
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockImplementation((_url, init) => {
				const { promise, reject } = Promise.withResolvers<Response>();
				(init as RequestInit).signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
				return promise;
			});
			const { callInteractiveLlm } = await importProvider();
			const settled = vi.fn();

			const result = callInteractiveLlm("S", "P", "chat", { session: "test:1" }).then(settled);
			await vi.advanceTimersByTimeAsync(30_000);
			expect(mockedFetch).toHaveBeenCalledTimes(2);
			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(30_000);
			await result;
			expect(settled).toHaveBeenCalledWith(null);
		});

		it("logs one start line, then each attempt's model and outcome, never the content", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(okReply("secret reply"));
			const { callInteractiveLlm } = await importProvider();

			await callInteractiveLlm("S", "secret prompt", "chat", { session: "mention:c1", label: "mention" });

			const lines = logSpy.mock.calls.map(([line]) => String(line));
			expect(lines.filter((line) => line.includes("event=start"))).toHaveLength(1);
			expect(lines).toContainEqual(
				expect.stringMatching(/attempt=primary model=deepseek-v4\.1-flash .*reason=http_error/),
			);
			expect(lines).toContainEqual(expect.stringMatching(/attempt=backup model=glm-5\.3-flash .*result=success/));
			expect(lines.join("\n")).not.toMatch(/secret/);
		});
	});

	describe("budgets", () => {
		function hangUntilAborted() {
			mockedFetch.mockImplementationOnce((_url, init) => {
				const { promise, reject } = Promise.withResolvers<Response>();
				(init as RequestInit).signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
				return promise;
			});
		}

		it("sends the output-token limit of each mode on every request", async () => {
			mockedFetch.mockResolvedValue(okReply());
			const { callInteractiveLlm, callBackgroundLlm, LLM_BUDGETS } = await importProvider();

			await callInteractiveLlm("S", "P", "chat", { session: "test:1" });
			await callInteractiveLlm("S", "P", "summary", { session: "test:1" });
			await callBackgroundLlm("S", "P", "personality", { session: "test:1" });
			await callBackgroundLlm("S", "P", "chat", { session: "test:1" });

			expect(sentBody(0).max_tokens).toBe(1500);
			expect(sentBody(1).max_tokens).toBe(4000);
			expect(sentBody(2).max_tokens).toBe(4000);
			expect(sentBody(3).max_tokens).toBe(1500);
			expect(LLM_BUDGETS).toEqual({
				chat: { maxTokens: 1500, timeoutMs: 30_000 },
				summary: { maxTokens: 4000, timeoutMs: 120_000 },
				personality: { maxTokens: 4000, timeoutMs: 180_000 },
			});
		});

		it("applies each mode's own timeout", async () => {
			vi.useFakeTimers();
			const { callInteractiveLlm, callBackgroundLlm } = await importProvider();
			const settled = vi.fn();

			for (const [call, mode, timeoutMs] of [
				[callInteractiveLlm, "chat", 30_000],
				[callInteractiveLlm, "summary", 120_000],
				[callBackgroundLlm, "personality", 180_000],
			] as const) {
				hangUntilAborted();
				const result = call("S", "P", mode, { session: "test:1" }).then(settled);
				await vi.advanceTimersByTimeAsync(timeoutMs - 1);
				expect(settled).not.toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(1);
				await result;
				expect(settled).toHaveBeenCalledWith(null);
				settled.mockClear();
			}
		});

		it("lets ZEN_TIMEOUT_MS override the chat timeout without capping summaries or personality builds", async () => {
			vi.useFakeTimers();
			process.env.ZEN_TIMEOUT_MS = "2000";
			const { callInteractiveLlm, callBackgroundLlm } = await importProvider();
			const settled = vi.fn();

			hangUntilAborted();
			const chat = callInteractiveLlm("S", "P", "chat", { session: "test:1" }).then(settled);
			await vi.advanceTimersByTimeAsync(2000);
			await chat;
			expect(settled).toHaveBeenCalledWith(null);
			settled.mockClear();

			hangUntilAborted();
			const summary = callInteractiveLlm("S", "P", "summary", { session: "test:1" }).then(settled);
			hangUntilAborted();
			const build = callBackgroundLlm("S", "P", "personality", { session: "test:1" }).then(settled);
			await vi.advanceTimersByTimeAsync(119_999);
			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			await summary;
			expect(settled).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(60_000);
			await build;
			expect(settled).toHaveBeenCalledTimes(2);
		});

		it("ignores a ZEN_TIMEOUT_MS below the minimum", async () => {
			vi.useFakeTimers();
			process.env.ZEN_TIMEOUT_MS = "10";
			const { callInteractiveLlm } = await importProvider();
			const settled = vi.fn();

			hangUntilAborted();
			const chat = callInteractiveLlm("S", "P", "chat", { session: "test:1" }).then(settled);
			await vi.advanceTimersByTimeAsync(29_999);
			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			await chat;
			expect(settled).toHaveBeenCalledWith(null);
		});
	});

	describe("truncation", () => {
		it("treats a response cut off by the token limit as no reply", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockResolvedValueOnce(okReply("This sentence stops mid-", "length"));
			const { callInteractiveLlm } = await importProvider();

			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBeNull();
			expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=truncated"));
			expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("stops mid"));
		});

		it("logs a length cutoff with no content as truncated, not empty", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockResolvedValueOnce(okReply("", "length"));
			const { callInteractiveLlm } = await importProvider();

			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBeNull();
			expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=truncated"));
			expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("reason=empty"));
		});

		it("logs a normal finish with no content as empty", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockResolvedValueOnce(okReply("", "stop"));
			const { callInteractiveLlm } = await importProvider();

			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBeNull();
			expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=empty"));
		});

		it("keeps a complete response that reports finish_reason stop", async () => {
			mockedFetch.mockResolvedValueOnce(okReply("All done.", "stop"));
			const { callInteractiveLlm } = await importProvider();

			expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBe("All done.");
		});
	});

	describe("concurrency", () => {
		type Pending = { resolve: (text: string) => void };

		// Each fetch hangs until the test resolves it, so in-flight requests can be counted.
		function holdRequests(): Pending[] {
			const pending: Pending[] = [];
			mockedFetch.mockImplementation(
				() =>
					new Promise((resolve) => {
						pending.push({ resolve: (text) => resolve(okReply(text)) });
					}),
			);
			return pending;
		}

		const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

		async function resolveAll(pending: Pending[], count: number) {
			for (let i = 0; i < count; i++) {
				await flush();
				pending[i]?.resolve("ok");
			}
		}

		it("never runs more than three requests at once and starts queued ones as slots free up", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			const pending = holdRequests();
			const { callInteractiveLlm } = await importProvider();

			const results = Array.from({ length: 5 }, (_, i) =>
				callInteractiveLlm("S", `P${i}`, "chat", { session: "test:1" }),
			);
			await flush();
			expect(mockedFetch).toHaveBeenCalledTimes(3);

			pending[0]?.resolve("r0");
			await flush();
			expect(mockedFetch).toHaveBeenCalledTimes(4);

			pending[1]?.resolve("r1");
			await flush();
			expect(mockedFetch).toHaveBeenCalledTimes(5);

			for (const [i, p] of pending.entries()) p.resolve(`r${i}`);
			expect(await Promise.all(results)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
		});

		it("releases the slot when a request fails", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			mockedFetch.mockRejectedValue(new TypeError("fetch failed"));
			const { callInteractiveLlm } = await importProvider();

			for (let i = 0; i < 10; i++) expect(await callInteractiveLlm("S", "P", "chat", { session: "test:1" })).toBeNull();
			expect(mockedFetch).toHaveBeenCalledTimes(10);
		});

		it("drops background work when the queue is full, without logging its content", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
			const pending = holdRequests();
			const { callInteractiveLlm, callBackgroundLlm } = await importProvider();

			const accepted = Array.from({ length: 9 }, () =>
				callInteractiveLlm("S", "accepted", "chat", { session: "test:1" }),
			);
			await flush();

			expect(
				await callBackgroundLlm("S", "secret background prompt", "chat", {
					session: "test:1",
					label: "random-responder",
				}),
			).toBeNull();
			expect(mockedFetch).toHaveBeenCalledTimes(3);
			expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reason=queue_full"));
			expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("secret background prompt"));

			await resolveAll(pending, 9);
			expect((await Promise.all(accepted)).every((r) => r === "ok")).toBe(true);
		});

		it("evicts queued background work to make room for an interactive request", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			const pending = holdRequests();
			const { callInteractiveLlm, callBackgroundLlm } = await importProvider();

			const accepted = Array.from({ length: 8 }, () =>
				callInteractiveLlm("S", "accepted", "chat", { session: "test:1" }),
			);
			const queuedBackground = callBackgroundLlm("S", "background", "chat", {
				session: "test:1",
				label: "random-responder",
			});
			await flush();

			const urgent = callInteractiveLlm("S", "urgent", "chat", { session: "test:1" });
			expect(await queuedBackground).toBeNull();

			await resolveAll(pending, 9);
			expect((await Promise.all([...accepted, urgent])).every((r) => r === "ok")).toBe(true);
			expect(mockedFetch).toHaveBeenCalledTimes(9);
		});

		it("drops an interactive request when the queue holds only interactive work", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			const pending = holdRequests();
			const { callInteractiveLlm } = await importProvider();

			const accepted = Array.from({ length: 9 }, () =>
				callInteractiveLlm("S", "accepted", "chat", { session: "test:1" }),
			);
			await flush();

			expect(await callInteractiveLlm("S", "overflow", "chat", { session: "test:1" })).toBeNull();

			await resolveAll(pending, 9);
			expect((await Promise.all(accepted)).every((r) => r === "ok")).toBe(true);
		});

		it("serves queued interactive requests before queued background ones", async () => {
			vi.spyOn(console, "log").mockImplementation(() => undefined);
			const pending = holdRequests();
			const { callInteractiveLlm, callBackgroundLlm } = await importProvider();

			const running = Array.from({ length: 3 }, () =>
				callInteractiveLlm("S", "running", "chat", { session: "test:1" }),
			);
			const background = callBackgroundLlm("S", "background", "chat", { session: "test:1" });
			const interactive = callInteractiveLlm("S", "interactive", "chat", { session: "test:1" });
			await flush();

			pending[0]?.resolve("ok");
			await flush();
			expect(sentBody(3).messages[1]?.content).toBe("interactive");

			await resolveAll(pending, 5);
			await Promise.all([...running, background, interactive]);
		});
	});
});
