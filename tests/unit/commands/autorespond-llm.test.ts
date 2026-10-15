import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoRespondCommand } from "../../../src/commands/autorespond/autorespond.js";
import { addAutoResponse } from "../../../src/db/queries/autoResponses.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/lib/constants.js", () => ({ TARGET_GUILD_ID: "home-guild" }));
vi.mock("../../../src/db/queries/autoResponses.js", () => ({
	addAutoResponse: vi.fn(),
	getGuildAutoResponses: vi.fn(),
	removeAutoResponse: vi.fn(),
}));

function addInteraction(guildId: string, useLlm: boolean) {
	const reply = vi.fn(async () => null);
	const interaction = {
		guildId,
		options: {
			getString: (name: string) => ({ trigger: "hello", response: "Be a pirate." })[name] ?? null,
			getBoolean: (name: string) => (name === "use-llm" ? useLlm : null),
			getInteger: () => null,
		},
		reply,
	};
	return { interaction, reply };
}

function createCommand() {
	return new AutoRespondCommand(createCommandContext("src/commands/autorespond/autorespond.ts"), {});
}

describe("/autorespond add use-llm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	it("stores an LLM response in the Home Server", async () => {
		const { interaction } = addInteraction("home-guild", true);

		await createCommand().runAdd(interaction as never);

		expect(addAutoResponse).toHaveBeenCalledWith(expect.objectContaining({ responseType: "llm" }));
	});

	it("refuses an LLM response in any other guild without storing it", async () => {
		const { interaction, reply } = addInteraction("foreign-guild", true);

		await createCommand().runAdd(interaction as never);

		expect(addAutoResponse).not.toHaveBeenCalled();
		expect(reply).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining("home server"), flags: MessageFlags.Ephemeral }),
		);
	});

	it("still stores a static response in any other guild", async () => {
		const { interaction } = addInteraction("foreign-guild", false);

		await createCommand().runAdd(interaction as never);

		expect(addAutoResponse).toHaveBeenCalledWith(expect.objectContaining({ responseType: "static" }));
	});
});
