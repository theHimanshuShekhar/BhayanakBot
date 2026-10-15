import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SummarizeCommand } from "../../../src/commands/utility/summarize.js";
import { callInteractiveLlm } from "../../../src/lib/llmProvider.js";
import { PROMPT_CHAR_BUDGET } from "../../../src/lib/summarize.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/llmProvider.js", () => ({ callInteractiveLlm: vi.fn() }));

const llm = vi.mocked(callInteractiveLlm);

interface Options {
	userId?: string;
	channelId?: string;
	count?: number;
	time?: string;
}

// `history` is oldest first, one message per second ending now.
function createInteraction(history: string[], options: Options = {}) {
	const now = Date.now();
	const newestFirst = history
		.map((content, i) => ({
			id: String(1000 + i),
			createdTimestamp: now - (history.length - i) * 1000,
			content,
			author: { bot: false, displayName: "ann" },
		}))
		.reverse();
	const fetch = vi.fn(async ({ limit, before }: { limit: number; before?: string }) => {
		const start = before ? newestFirst.findIndex((m) => m.id === before) + 1 : 0;
		return new Collection(newestFirst.slice(start, start + limit).map((m) => [m.id, m]));
	});
	return {
		user: { id: options.userId ?? "u1" },
		channelId: options.channelId ?? "c1",
		channel: { isTextBased: () => true, messages: { fetch } },
		options: {
			getString: () => options.time ?? null,
			getInteger: () => options.count ?? null,
		},
		reply: vi.fn(async (_payload?: unknown) => null),
		deferReply: vi.fn(async (_payload?: unknown) => null),
		editReply: vi.fn(async (_payload?: unknown) => null),
	};
}

function createCommand() {
	return new SummarizeCommand(createCommandContext("src/commands/utility/summarize.ts"), {});
}

const run = (command: SummarizeCommand, interaction: ReturnType<typeof createInteraction>) =>
	command.chatInputRun(interaction as never);

const HISTORY = ["one", "two", "three"];

describe("/summarize", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	it("replies with the coverage and the summary", async () => {
		llm.mockResolvedValue("- they talked");
		const interaction = createInteraction(HISTORY);

		await run(createCommand(), interaction);

		const reply = interaction.editReply.mock.calls[0][0] as any;
		expect(reply.content).toMatch(/^Summarized the last 3 messages \(since <t:\d+:t>\)$/);
		expect(reply.embeds[0].data.description).toBe("- they talked");
		expect(llm.mock.calls[0][1]).toBe("ann: one\nann: two\nann: three");
	});

	it("sends more than 100 messages to the model oldest first", async () => {
		llm.mockResolvedValue("summary");
		const history = Array.from({ length: 150 }, (_, i) => `msg${i}`);
		const interaction = createInteraction(history, { time: "1h" });

		await run(createCommand(), interaction);

		const prompt = llm.mock.calls[0][1];
		expect(prompt.split("\n")).toEqual(history.map((m) => `ann: ${m}`));
		expect((interaction.editReply.mock.calls[0][0] as any).content).toContain("last 150 messages");
	});

	it("trims the oldest messages to stay under the prompt budget and reports the real coverage", async () => {
		llm.mockResolvedValue("summary");
		const history = Array.from({ length: 200 }, (_, i) => `${String(i).padStart(3, "0")} ${"x".repeat(496)}`);
		const interaction = createInteraction(history, { count: 200 });

		await run(createCommand(), interaction);

		const prompt = llm.mock.calls[0][1];
		expect(prompt.length).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET);
		const covered = prompt.split("\n");
		expect(covered.at(-1)).toContain("199 ");
		const content = (interaction.editReply.mock.calls[0][0] as any).content as string;
		expect(content).toContain(`last ${covered.length} messages`);
		expect(covered.length).toBeLessThan(200);
	});

	it("truncates a long model reply to the embed description limit", async () => {
		llm.mockResolvedValue("a".repeat(9000));
		const interaction = createInteraction(HISTORY);

		await run(createCommand(), interaction);

		const reply = interaction.editReply.mock.calls[0][0] as any;
		expect(reply.embeds[0].data.description.length).toBeLessThanOrEqual(4096);
	});

	describe("cooldowns", () => {
		it("a produced summary puts the member on cooldown", async () => {
			llm.mockResolvedValue("summary");
			const command = createCommand();
			await run(command, createInteraction(HISTORY));

			const second = createInteraction(HISTORY, { channelId: "c2" });
			await run(command, second);

			expect(llm).toHaveBeenCalledTimes(1);
			expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
			expect(second.deferReply).not.toHaveBeenCalled();
		});

		it("a produced summary puts the channel on cooldown for other members", async () => {
			llm.mockResolvedValue("summary");
			const command = createCommand();
			await run(command, createInteraction(HISTORY));

			const second = createInteraction(HISTORY, { userId: "u2" });
			await run(command, second);

			expect(llm).toHaveBeenCalledTimes(1);
			expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
		});

		it("a failed summary does not consume the cooldown", async () => {
			llm.mockResolvedValueOnce(null).mockResolvedValueOnce("summary");
			const command = createCommand();

			await run(command, createInteraction(HISTORY));
			const retry = createInteraction(HISTORY);
			await run(command, retry);

			expect(llm).toHaveBeenCalledTimes(2);
			expect(retry.reply).not.toHaveBeenCalled();
			expect((retry.editReply.mock.calls[0][0] as any).content).toContain("Summarized");
		});

		it("an empty summary does not consume the cooldown", async () => {
			llm.mockResolvedValueOnce("   ").mockResolvedValueOnce("summary");
			const command = createCommand();

			const first = createInteraction(HISTORY);
			await run(command, first);
			await run(command, createInteraction(HISTORY));

			expect(llm).toHaveBeenCalledTimes(2);
			expect((first.editReply.mock.calls[0][0] as any).embeds[0].data.description).toContain("Could not generate");
		});

		it("a channel with no messages does not consume the cooldown", async () => {
			llm.mockResolvedValue("summary");
			const command = createCommand();

			const empty = createInteraction([]);
			await run(command, empty);
			await run(command, createInteraction(HISTORY));

			expect(empty.editReply).toHaveBeenCalledWith({ content: "📭 No messages found to summarize." });
			expect(llm).toHaveBeenCalledTimes(1);
		});

		it("two concurrent runs in one channel call the LLM once", async () => {
			let finish: (value: string) => void = () => {};
			llm.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
			const command = createCommand();

			const first = run(command, createInteraction(HISTORY));
			const second = createInteraction(HISTORY, { userId: "u2" });
			await run(command, second);
			finish("summary");
			await first;

			expect(llm).toHaveBeenCalledTimes(1);
			expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
		});

		it("releases the channel when a run fails, so the next run can proceed", async () => {
			llm.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("summary");
			const command = createCommand();

			await expect(run(command, createInteraction(HISTORY))).rejects.toThrow("boom");
			await run(command, createInteraction(HISTORY));

			expect(llm).toHaveBeenCalledTimes(2);
		});
	});
});
