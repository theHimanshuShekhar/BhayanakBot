import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const mockedFetch = vi.fn();

async function importOllama() {
	vi.resetModules();
	return import("../../../src/lib/ollama.js");
}

describe("Ollama logging", () => {
	afterEach(() => {
		process.env = { ...originalEnv };
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("does not log raw prompts or responses by default", async () => {
		delete process.env.OLLAMA_DEBUG_CONTENT_LOGS;
		mockedFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ response: "secret response" }) });
		vi.stubGlobal("fetch", mockedFetch);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const { callOllama } = await importOllama();

		await expect(callOllama("secret system", "secret prompt", 1000)).resolves.toBe("secret response");

		const logs = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
		expect(logs).toContain("systemLength=");
		expect(logs).toContain("responseLength=");
		expect(logs).not.toContain("secret system");
		expect(logs).not.toContain("secret prompt");
		expect(logs).not.toContain("secret response");
	});
});
