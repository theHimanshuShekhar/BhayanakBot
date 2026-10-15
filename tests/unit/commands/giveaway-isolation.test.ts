import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiveawayCommand } from "../../../src/commands/giveaway/giveaway.js";
import { endGiveaway, getGiveawayByMessage, rerollGiveaway } from "../../../src/db/queries/giveaways.js";
import { createGiveawayRow, createGuild } from "../../helpers/giveawayMocks.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({
	createGiveaway: vi.fn(),
	endGiveaway: vi.fn(),
	markGiveawayAnnounced: vi.fn(),
	recordGiveawayAnnounceFailure: vi.fn(),
	getGiveawayByMessage: vi.fn(),
	rerollGiveaway: vi.fn(),
}));

function createInteraction(memberIds: string[]) {
	const guild = createGuild(memberIds);
	return {
		guild,
		options: { getString: () => "m1" },
		guildId: "g1",
		reply: vi.fn(async () => null),
		deferReply: vi.fn(async () => null),
		editReply: vi.fn(async () => null),
	};
}

function createCommand() {
	return new GiveawayCommand(createCommandContext("src/commands/giveaway/giveaway.ts"), {});
}

describe("giveaway guild isolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	it("looks giveaways up in the invoking guild only", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(undefined);

		await createCommand().runEnd(createInteraction([]) as never);
		await createCommand().runReroll(createInteraction([]) as never);

		expect(vi.mocked(getGiveawayByMessage).mock.calls).toEqual([
			["g1", "m1"],
			["g1", "m1"],
		]);
	});

	it("/giveaway end with another guild's message ID says not found and changes nothing", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(undefined);
		const interaction = createInteraction(["w1"]);

		await createCommand().runEnd(interaction as never);

		expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "Giveaway not found." }));
		expect(endGiveaway).not.toHaveBeenCalled();
		expect(interaction.guild.channel.send).not.toHaveBeenCalled();
	});

	it("/giveaway reroll with another guild's message ID says not found and changes nothing", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(undefined);
		const interaction = createInteraction(["w1"]);

		await createCommand().runReroll(interaction as never);

		expect(interaction.reply).toHaveBeenCalledWith(
			expect.objectContaining({ content: "Giveaway not found or hasn't ended yet." }),
		);
		expect(rerollGiveaway).not.toHaveBeenCalled();
	});

	it("/giveaway end announces nothing when the expiry task ended it first", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(createGiveawayRow({ entries: ["w1"] }) as never);
		vi.mocked(endGiveaway).mockResolvedValue(undefined);
		const interaction = createInteraction(["w1"]);

		await createCommand().runEnd(interaction as never);

		expect(interaction.guild.channel.send).not.toHaveBeenCalled();
		expect(interaction.editReply).toHaveBeenCalledWith({ content: "This giveaway has already ended." });
	});

	it("/giveaway end draws only members who are still in the server", async () => {
		const giveaway = createGiveawayRow({ winnerCount: 2, entries: ["w1", "left", "w2"] });
		vi.mocked(getGiveawayByMessage).mockResolvedValue(giveaway as never);
		vi.mocked(endGiveaway).mockImplementation((async (_guildId: string, _messageId: string, winners: string[]) => ({
			...giveaway,
			ended: true,
			winners,
		})) as never);
		const interaction = createInteraction(["w1", "w2"]);

		await createCommand().runEnd(interaction as never);

		const stored = vi.mocked(endGiveaway).mock.calls[0]?.[2] as string[];
		expect([...stored].sort()).toEqual(["w1", "w2"]);
		const [sent] = interaction.guild.channel.send.mock.calls[0] as unknown as [{ content: string }];
		expect(sent.content).not.toContain("left");
	});

	it("/giveaway reroll excludes previous winners and records the new ones", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(
			createGiveawayRow({ ended: true, winners: ["w1"], entries: ["w1", "w2", "left"] }) as never,
		);
		vi.mocked(rerollGiveaway).mockResolvedValue({} as never);
		const interaction = createInteraction(["w1", "w2"]);

		await createCommand().runReroll(interaction as never);

		expect(rerollGiveaway).toHaveBeenCalledWith("g1", "m1", ["w1"], ["w2"]);
		const [sent] = interaction.guild.channel.send.mock.calls[0] as unknown as [{ content: string }];
		expect(sent.content).toContain("<@w2>");
		expect(sent.content).not.toContain("<@w1>");
	});

	it("/giveaway reroll tells the moderator when the announcement cannot be posted", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(
			createGiveawayRow({ ended: true, winners: ["w1"], entries: ["w1", "w2"] }) as never,
		);
		vi.mocked(rerollGiveaway).mockResolvedValue({} as never);
		const interaction = createInteraction(["w1", "w2"]);
		interaction.guild.channel.send.mockRejectedValue(new Error("Missing Access"));

		await createCommand().runReroll(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledWith({
			content: expect.stringContaining("announcement could not be posted"),
		});
	});

	it("/giveaway reroll says it was just rerolled and announces nothing when it loses the race", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(createGiveawayRow({ ended: true, entries: ["w1"] }) as never);
		vi.mocked(rerollGiveaway).mockResolvedValue(undefined);
		const interaction = createInteraction(["w1"]);

		await createCommand().runReroll(interaction as never);

		expect(interaction.guild.channel.send).not.toHaveBeenCalled();
		expect(interaction.editReply).toHaveBeenCalledWith({ content: "This giveaway was just rerolled. Try again." });
	});

	it("/giveaway reroll says No eligible entrants and changes nothing when nobody is left", async () => {
		vi.mocked(getGiveawayByMessage).mockResolvedValue(
			createGiveawayRow({ ended: true, winners: ["w1"], entries: ["w1", "left"] }) as never,
		);
		const interaction = createInteraction(["w1"]);

		await createCommand().runReroll(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledWith({ content: "No eligible entrants." });
		expect(rerollGiveaway).not.toHaveBeenCalled();
	});
});
