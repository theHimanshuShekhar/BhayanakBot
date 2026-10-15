import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiveawayCommand } from "../../../src/commands/giveaway/giveaway.js";
import { getGiveawayByMessage, rerollGiveaway } from "../../../src/db/queries/giveaways.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";
import { createGiveawayRow, createGuild } from "../../helpers/giveawayMocks.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	createGiveaway: vi.fn(),
	endGiveaway: vi.fn(),
	getGiveawayByMessage: vi.fn(),
	rerollGiveaway: vi.fn(),
}));

describe("giveaway Mention Policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	it("reroll reply notifies only the new winners", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(
			createGiveawayRow({ ended: true, winnerCount: 2, entries: ["w1", "w2", "w3"] }) as never,
		);
		vi.mocked(rerollGiveaway).mockResolvedValue({} as never);
		const guild = createGuild(["w1", "w2", "w3"]);
		const interaction = {
			options: { getString: () => "m1" },
			guildId: "g1",
			guild,
			deferReply: vi.fn(async () => null),
			editReply: vi.fn(async () => null),
		};

		const command = new GiveawayCommand(createCommandContext("src/commands/giveaway/giveaway.ts"), {});
		await command.runReroll(interaction as never);

		// The notification is a new message in the giveaway's channel; edits do not reliably notify.
		expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
		expect(guild.channels.fetch).toHaveBeenCalledWith("c1");
		expect(interaction.editReply).toHaveBeenCalledWith({ content: "Rerolled! New winners announced." });
		const [sent] = guild.channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		const winners = vi.mocked(rerollGiveaway).mock.calls[0]?.[3] as string[];
		expect(winners).toHaveLength(2);
		for (const winner of winners) expect(sent.content).toContain(`<@${winner}>`);
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: winners });
	});
});
