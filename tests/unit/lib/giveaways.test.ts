import { beforeEach, describe, expect, it, vi } from "vitest";
import { endGiveaway } from "../../../src/db/queries/giveaways.js";
import { drawEligibleWinners, endAndAnnounceGiveaway } from "../../../src/lib/giveaways.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";
import { createGiveawayRow, createGuild } from "../../helpers/giveawayMocks.js";

vi.mock("../../../src/db/queries/giveaways.js", () => ({ endGiveaway: vi.fn() }));

describe("drawEligibleWinners", () => {
	it("never picks entrants who left the server", async () => {
		const guild = createGuild(["stays1", "stays2"]);

		for (let i = 0; i < 20; i++) {
			const winners = await drawEligibleWinners(guild as never, ["gone1", "stays1", "gone2", "stays2"], 2);
			expect([...winners].sort()).toEqual(["stays1", "stays2"]);
		}
	});

	it("never picks excluded previous winners", async () => {
		const guild = createGuild(["a", "b", "c"]);

		for (let i = 0; i < 20; i++) {
			const winners = await drawEligibleWinners(guild as never, ["a", "b", "c"], 2, ["a"]);
			expect([...winners].sort()).toEqual(["b", "c"]);
		}
	});

	it("returns fewer winners than requested, or none, when too few are eligible", async () => {
		const guild = createGuild(["a"]);

		expect(await drawEligibleWinners(guild as never, ["a", "gone"], 3)).toEqual(["a"]);
		expect(await drawEligibleWinners(guild as never, ["gone"], 1)).toEqual([]);
		expect(await drawEligibleWinners(guild as never, ["a"], 1, ["a"])).toEqual([]);
		expect(await drawEligibleWinners(guild as never, [], 1)).toEqual([]);
	});

	it("checks membership in batches of at most 100 and stops once it has enough winners", async () => {
		const entries = Array.from({ length: 450 }, (_, i) => `u${i}`);
		const guild = createGuild(entries);

		const winners = await drawEligibleWinners(guild as never, entries, 3);

		expect(winners).toHaveLength(3);
		expect(guild.members.fetch).toHaveBeenCalledTimes(1);

		const noneHere = createGuild([]);
		await drawEligibleWinners(noneHere as never, entries, 3);
		const batchSizes = noneHere.members.fetch.mock.calls.map(([arg]) => arg.user.length);
		expect(batchSizes).toEqual([100, 100, 100, 100, 50]);
	});
});

describe("endAndAnnounceGiveaway", () => {
	beforeEach(() => vi.clearAllMocks());

	it("announces the same winners it stored", async () => {
		const guild = createGuild(["w1", "w2"]);
		const giveaway = createGiveawayRow({ winnerCount: 2, entries: ["w1", "w2", "left"] });
		vi.mocked(endGiveaway).mockResolvedValue({ ...giveaway, ended: true } as never);

		const winners = await endAndAnnounceGiveaway(guild as never, giveaway as never);

		const stored = vi.mocked(endGiveaway).mock.calls[0];
		expect(stored?.slice(0, 2)).toEqual(["g1", "m1"]);
		expect(stored?.[2]).toEqual(winners);
		expect([...(winners ?? [])].sort()).toEqual(["w1", "w2"]);
		const [sent] = guild.channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		for (const winner of winners ?? []) expect(sent.content).toContain(`<@${winner}>`);
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: winners });
	});

	it("announces nothing when another caller already ended the giveaway", async () => {
		const guild = createGuild(["w1"]);
		vi.mocked(endGiveaway).mockResolvedValue(undefined);

		const winners = await endAndAnnounceGiveaway(guild as never, createGiveawayRow({ entries: ["w1"] }) as never);

		expect(winners).toBeUndefined();
		expect(guild.channel.send).not.toHaveBeenCalled();
		expect(guild.channel.messages.fetch).not.toHaveBeenCalled();
	});

	it("says No eligible entrants instead of congratulating nobody", async () => {
		const guild = createGuild([]);
		const giveaway = createGiveawayRow({ entries: ["left1", "left2"] });
		vi.mocked(endGiveaway).mockResolvedValue({ ...giveaway, ended: true } as never);

		const winners = await endAndAnnounceGiveaway(guild as never, giveaway as never);

		expect(winners).toEqual([]);
		expect(vi.mocked(endGiveaway).mock.calls[0]?.[2]).toEqual([]);
		const [sent] = guild.channel.send.mock.calls[0] as unknown as [{ content: string }];
		expect(sent.content).toContain("No eligible entrants");
		expect(sent.content).not.toContain("Congratulations");
	});

	it("does not end the giveaway when the member check fails", async () => {
		const guild = createGuild(["w1"]);
		guild.members.fetch.mockRejectedValue(new Error("gateway timeout"));

		await expect(
			endAndAnnounceGiveaway(guild as never, createGiveawayRow({ entries: ["w1"] }) as never),
		).rejects.toThrow("gateway timeout");
		expect(endGiveaway).not.toHaveBeenCalled();
	});
});
