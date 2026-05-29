import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateChatResponse, generateMentionReply } from "../../../src/lib/autoresponder/llmResponse.js";
import { callInteractiveLlm } from "../../../src/lib/llmProvider.js";

vi.mock("../../../src/lib/llmProvider.js", () => ({
	callInteractiveLlm: vi.fn(async () => "generated reply"),
}));

const mockedCallInteractiveLlm = vi.mocked(callInteractiveLlm);

describe("LLM response prompts", () => {
	beforeEach(() => {
		mockedCallInteractiveLlm.mockClear();
	});

	it("asks mention replies for jokes or playful roasts without hostile no-mercy wording", async () => {
		await generateMentionReply("", "<@1>: hello", "<@2>", "say something");

		const prompt = mockedCallInteractiveLlm.mock.calls[0]?.[1] ?? "";
		expect(prompt).toContain("joke or playful roast");
		expect(prompt).toContain("Avoid genuine hostility");
		expect(prompt).not.toMatch(/No mercy|Reply savagely/i);
		expect(mockedCallInteractiveLlm.mock.calls[0]?.[4]).toBe("autoresponder:mention-reply");
	});

	it("asks chat replies for jokes or playful roasts without hostile no-mercy wording", async () => {
		await generateChatResponse("", "<@1>: hello", "<@2>", "say something");

		const prompt = mockedCallInteractiveLlm.mock.calls[0]?.[1] ?? "";
		expect(prompt).toContain("joke or playful roast");
		expect(prompt).toContain("Keep it funny, not hostile");
		expect(prompt).not.toMatch(/No mercy|Reply savagely/i);
		expect(mockedCallInteractiveLlm.mock.calls[0]?.[4]).toBe("autoresponder:chat-response");
	});
});
