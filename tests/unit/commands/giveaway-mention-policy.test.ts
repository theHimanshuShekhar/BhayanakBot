import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiveawayCommand } from "../../../src/commands/giveaway/giveaway.js";
import { endGiveaway, getGiveawayByMessage } from "../../../src/db/queries/giveaways.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	createGiveaway: vi.fn(),
	endGiveaway: vi.fn(),
	getGiveawayByMessage: vi.fn(),
}));

describe("giveaway Mention Policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	it("reroll reply notifies only the new winners", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue({
			ended: true,
			messageId: "m1",
			winnerCount: 2,
			entries: ["w1", "w2", "w3"],
		} as never);
		const reply = vi.fn(async () => null);
		const interaction = { options: { getString: () => "m1" }, reply };

		const command = new GiveawayCommand(createCommandContext("src/commands/giveaway/giveaway.ts"), {});
		await command.runReroll(interaction as never);

		const [sent] = reply.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		const winners = vi.mocked(endGiveaway).mock.calls[0]?.[1] as string[];
		expect(winners).toHaveLength(2);
		for (const winner of winners) expect(sent.content).toContain(`<@${winner}>`);
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: winners });
	});
});
