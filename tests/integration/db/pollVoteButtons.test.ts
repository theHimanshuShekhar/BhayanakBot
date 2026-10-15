import { InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPoll, getPollByMessage } from "../../../src/db/queries/polls.js";
import { polls } from "../../../src/db/schema.js";
import { PollVoteButtonsHandler } from "../../../src/interaction-handlers/pollVoteButtons.js";
import { db } from "../../../src/lib/database.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const MESSAGE = "9200000000000000002";
const MINUTE = 60_000;

function click() {
	return {
		customId: "poll_vote:0",
		message: { id: MESSAGE },
		user: { id: "voter" },
		reply: vi.fn(async (_options: unknown) => null),
		update: vi.fn(async (_options: unknown) => null),
		followUp: vi.fn(async (_options: unknown) => null),
	};
}

async function seed(expiresAt: Date) {
	await db.delete(polls);
	await createPoll({
		messageId: MESSAGE,
		channelId: "c1",
		guildId: "g1",
		question: "Best language?",
		options: [
			{ label: "TS", votes: [] },
			{ label: "Go", votes: [] },
		],
		expiresAt,
	});
}

describe("poll vote button", () => {
	const handler = () =>
		new PollVoteButtonsHandler(createCommandContext("src/interaction-handlers/pollVoteButtons.ts") as never, {
			interactionHandlerType: InteractionHandlerTypes.Button,
		});

	beforeEach(() => setupSapphireContainer());

	it("refuses a vote on an expired poll before the closing task has run, recording nothing", async () => {
		await seed(new Date(Date.now() - MINUTE));
		const interaction = click();

		await handler().run(interaction as never);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: "This poll has already ended.",
			flags: MessageFlags.Ephemeral,
		});
		expect(interaction.update).not.toHaveBeenCalled();
		const stored = await getPollByMessage(MESSAGE);
		expect((stored?.options as Array<{ votes: string[] }>).flatMap((o) => o.votes)).toEqual([]);
	});

	it("records a vote on a poll that is still open", async () => {
		await seed(new Date(Date.now() + 10 * MINUTE));
		const interaction = click();

		await handler().run(interaction as never);

		expect(interaction.update).toHaveBeenCalledTimes(1);
		const stored = await getPollByMessage(MESSAGE);
		expect((stored?.options as Array<{ votes: string[] }>)[0]?.votes).toEqual(["voter"]);
	});
});
