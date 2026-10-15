import { container } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	answerInteraction,
	reportInteractionDenied,
	reportInteractionError,
} from "../../../src/lib/interactionErrors.js";
import { setupSapphireContainer } from "../../helpers/sapphireMocks.js";

interface FakeOptions {
	replied?: boolean;
	deferred?: boolean;
	component?: boolean;
	repliable?: boolean;
}

function fakeInteraction({ replied = false, deferred = false, component = false, repliable = true }: FakeOptions = {}) {
	return {
		replied,
		deferred,
		isRepliable: () => repliable,
		isMessageComponent: () => component,
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		followUp: vi.fn().mockResolvedValue(undefined),
	};
}

describe("interaction error replies", () => {
	const logger = { error: vi.fn(), warn: vi.fn() };

	beforeEach(() => {
		setupSapphireContainer();
		logger.error.mockReset();
		logger.warn.mockReset();
		(container as any).logger = logger;
	});

	it("sends an ephemeral reply when nothing was sent yet", async () => {
		const interaction = fakeInteraction();
		await answerInteraction(interaction as any, "hello");
		expect(interaction.reply).toHaveBeenCalledWith({ content: "hello", flags: MessageFlags.Ephemeral });
		expect(interaction.editReply).not.toHaveBeenCalled();
		expect(interaction.followUp).not.toHaveBeenCalled();
	});

	it("edits the reply when the interaction was deferred", async () => {
		const interaction = fakeInteraction({ deferred: true });
		await answerInteraction(interaction as any, "hello");
		expect(interaction.editReply).toHaveBeenCalledWith({ content: "hello" });
		expect(interaction.reply).not.toHaveBeenCalled();
		expect(interaction.followUp).not.toHaveBeenCalled();
	});

	it("sends an ephemeral follow-up after a reply, even if it was deferred first", async () => {
		const interaction = fakeInteraction({ deferred: true, replied: true });
		await answerInteraction(interaction as any, "hello");
		expect(interaction.followUp).toHaveBeenCalledWith({ content: "hello", flags: MessageFlags.Ephemeral });
		expect(interaction.editReply).not.toHaveBeenCalled();
		expect(interaction.reply).not.toHaveBeenCalled();
	});

	it("does not overwrite the clicked message after a deferred component update", async () => {
		const interaction = fakeInteraction({ deferred: true, component: true });
		await answerInteraction(interaction as any, "hello");
		expect(interaction.followUp).toHaveBeenCalledWith({ content: "hello", flags: MessageFlags.Ephemeral });
		expect(interaction.editReply).not.toHaveBeenCalled();
	});

	it("does nothing for interactions that cannot be replied to", async () => {
		const interaction = fakeInteraction({ repliable: false });
		await answerInteraction(interaction as any, "hello");
		expect(interaction.reply).not.toHaveBeenCalled();
	});

	it("logs instead of throwing when the interaction has expired", async () => {
		const interaction = fakeInteraction();
		const expired = new Error("Unknown interaction");
		interaction.reply.mockRejectedValue(expired);
		await expect(answerInteraction(interaction as any, "hello")).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Could not answer"), expired);
	});

	it("puts the same reference in the reply and the log, without leaking the error text", async () => {
		const interaction = fakeInteraction();
		const error = new Error("secret database detail");
		await reportInteractionError(interaction as any, error, 'chat input command "ping"');

		const reply = interaction.reply.mock.calls[0]?.[0] as { content: string; flags: number };
		const reference = /Reference: `([0-9a-f]{6})`/.exec(reply.content)?.[1];
		expect(reference).toBeDefined();
		expect(reply.content).toMatch(/^Something went wrong\./);
		expect(reply.content).not.toContain("secret");
		expect(reply.flags).toBe(MessageFlags.Ephemeral);
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(reference as string), error);
	});

	it("edits the deferred reply with the reference when an error follows a defer", async () => {
		const interaction = fakeInteraction({ deferred: true });
		await reportInteractionError(interaction as any, new Error("boom"), "chat input command");
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: expect.stringMatching(/^Something went wrong\. Reference: `[0-9a-f]{6}`$/),
		});
	});

	it("shows the denial message ephemerally", async () => {
		const interaction = fakeInteraction();
		await reportInteractionDenied(interaction as any, "You need the DJ role to use music commands.");
		expect(interaction.reply).toHaveBeenCalledWith({
			content: "You need the DJ role to use music commands.",
			flags: MessageFlags.Ephemeral,
		});
	});
});
