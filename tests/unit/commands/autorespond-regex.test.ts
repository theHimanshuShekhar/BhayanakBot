import { container } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoRespondCommand } from "../../../src/commands/autorespond/autorespond.js";
import { addAutoResponse, getGuildAutoResponses } from "../../../src/db/queries/autoResponses.js";
import { MAX_REGEX_PATTERN_LENGTH, regexTriggerTestHooks } from "../../../src/lib/autoresponder/regexTrigger.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/autoResponses.js", () => ({
	addAutoResponse: vi.fn(),
	getGuildAutoResponses: vi.fn(),
	removeAutoResponse: vi.fn(),
}));

function createCommand() {
	return new AutoRespondCommand(createCommandContext("src/commands/autorespond/autorespond.ts"), {});
}

function addInteraction(trigger: string) {
	const reply = vi.fn(async () => null);
	const interaction = {
		guildId: "g1",
		options: {
			getString: (name: string) => ({ trigger, response: "hi" })[name] ?? null,
			getBoolean: (name: string) => (name === "use-regex" ? true : null),
			getInteger: () => null,
		},
		reply,
	};
	return { interaction, reply };
}

function stored(id: number, trigger: string) {
	return {
		id,
		guildId: "g1",
		trigger,
		response: "hi",
		matchType: "contains",
		responseType: "static",
		useRegex: true,
		channelIds: [],
		requireMention: false,
		chancePercent: 100,
		deleteTrigger: false,
	};
}

describe("/autorespond regex triggers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
		regexTriggerTestHooks.clearCache();
		container.logger = { warn: vi.fn() } as unknown as typeof container.logger;
	});

	it.each([
		["a lookahead", "foo(?=bar)"],
		["a backreference", "(a)\\1"],
		["an over-length pattern", "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1)],
	])("add rejects %s without storing it", async (_label, trigger) => {
		const { interaction, reply } = addInteraction(trigger);

		await createCommand().runAdd(interaction as never);

		expect(addAutoResponse).not.toHaveBeenCalled();
		expect(reply).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("Unsupported regex pattern"),
				flags: MessageFlags.Ephemeral,
			}),
		);
	});

	it("add stores a supported named-capture pattern", async () => {
		const { interaction } = addInteraction("^my name is (?<name>.+)$");

		await createCommand().runAdd(interaction as never);

		expect(addAutoResponse).toHaveBeenCalledWith(
			expect.objectContaining({ trigger: "^my name is (?<name>.+)$", useRegex: true }),
		);
	});

	it("list marks stored incompatible patterns as disabled and leaves working ones alone", async () => {
		vi.mocked(getGuildAutoResponses).mockResolvedValue([stored(1, "foo(?=bar)"), stored(2, "ok+")] as never);
		const reply = vi.fn(async () => null);

		await createCommand().runList({ guildId: "g1", reply } as never);

		const [{ embeds }] = reply.mock.calls[0] as unknown as [{ embeds: { data: { description: string } }[] }];
		const [bad, good] = embeds[0].data.description.split("\n");
		expect(bad).toContain("DISABLED");
		expect(good).not.toContain("DISABLED");
	});
});
