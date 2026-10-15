import { ChannelType, SlashCommandBuilder } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { antiRaidChange, autoModChange, resetValue } from "../../../src/commands/config/config.js";
import { updateSettings } from "../../../src/db/queries/guildSettings.js";
import { createCommandContext, loadCommandClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/guildSettings.js", () => ({
	getOrCreateSettings: vi.fn(),
	updateSettings: vi.fn(async () => ({})),
}));

type Options = Record<string, unknown>;

async function loadConfig() {
	const ConfigCommand = await loadCommandClass("../../../src/commands/config/config.js");
	return new ConfigCommand(createCommandContext("src/commands/config/config.ts"), {}) as unknown as Record<
		string,
		(interaction: unknown) => Promise<unknown>
	> & { registerApplicationCommands: (registry: unknown) => void };
}

function interactionWith(options: Options) {
	return {
		guildId: "g1",
		deferReply: vi.fn(async () => null),
		editReply: vi.fn(async (_reply: unknown) => null),
		options: {
			getString: (name: string) => (options[name] as string | undefined) ?? null,
			getInteger: (name: string) => (options[name] as number | undefined) ?? null,
			getBoolean: (name: string) => (options[name] as boolean | undefined) ?? null,
			getChannel: (name: string) => (options[name] as unknown) ?? null,
			getRole: (name: string) => (options[name] as unknown) ?? null,
		},
	};
}

const reply = (interaction: ReturnType<typeof interactionWith>) =>
	interaction.editReply.mock.calls.at(-1)![0] as string;

beforeAll(() => {
	setupSapphireContainer();
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("/config command shape", () => {
	async function commandJson() {
		const command = await loadConfig();
		let json: ReturnType<SlashCommandBuilder["toJSON"]> | undefined;
		command.registerApplicationCommands({
			registerChatInputCommand(register: (b: SlashCommandBuilder) => SlashCommandBuilder) {
				json = register(new SlashCommandBuilder()).toJSON();
			},
		});
		return json!;
	}

	const sub = (json: any, name: string) => json.options.find((o: any) => o.name === name);
	const option = (subcommand: any, name: string) => subcommand.options.find((o: any) => o.name === name);

	it("reset offers exactly the settings that set offers, and never guild_id", async () => {
		const json = await commandJson();
		const setChoices = option(sub(json, "set"), "setting").choices;
		const resetChoices = option(sub(json, "reset"), "setting").choices;
		expect(resetChoices).toEqual(setChoices);
		expect(resetChoices.map((c: { value: string }) => c.value)).not.toContain("guildId");
	});

	it("channel option only offers text and announcement channels", async () => {
		const channel = option(sub(await commandJson(), "set"), "channel");
		expect(channel.channel_types).toEqual([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
	});

	it("number option accepts 0", async () => {
		expect(option(sub(await commandJson(), "set"), "number").min_value).toBe(0);
	});
});

describe("/config reset", () => {
	const resets: [string, unknown][] = [
		["welcomeChannelId", null],
		["goodbyeChannelId", null],
		["logChannelId", null],
		["levelUpChannelId", null],
		["musicChannelId", null],
		["starboardChannelId", null],
		["randomResponseChannelId", null],
		["autoRole", null],
		["mutedRoleId", null],
		["djRoleId", null],
		["moderatorRoleId", null],
		["welcomeMessage", null],
		["goodbyeMessage", null],
		["levelUpMessage", null],
		["starThreshold", 3],
		["xpRate", 15],
		["xpCooldownSeconds", 60],
		["randomResponseChance", 0],
		["personalityEnabled", true],
	];

	it.each(resets)("%s goes back to %s", async (setting, expected) => {
		const interaction = interactionWith({ setting });
		await (await loadConfig()).chatInputReset(interaction);
		expect(updateSettings).toHaveBeenCalledWith("g1", { [setting]: expected });
		expect(resetValue(setting as never)).toBe(expected);
	});

	it.each([
		"guildId",
		"autoModEnabled",
		"antiRaidJoinWindow",
		"constructor",
		"__proto__",
	])("refuses %s, which is not user-configurable", async (setting) => {
		const interaction = interactionWith({ setting });
		await (await loadConfig()).chatInputReset(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
		expect(reply(interaction)).toContain("not a configurable setting");
	});
});

describe("/config set", () => {
	const setting = (name: string, options: Options = {}) => interactionWith({ setting: name, ...options });
	const channelOf = (type: ChannelType) => ({ id: "c1", type });

	it("accepts text and announcement channels", async () => {
		for (const type of [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
			const interaction = setting("logChannelId", { channel: channelOf(type) });
			await (await loadConfig()).chatInputSet(interaction);
			expect(updateSettings).toHaveBeenLastCalledWith("g1", { logChannelId: "c1" });
		}
	});

	it.each([
		["category", ChannelType.GuildCategory],
		["voice", ChannelType.GuildVoice],
		["stage", ChannelType.GuildStageVoice],
		["forum", ChannelType.GuildForum],
		["thread", ChannelType.PublicThread],
	])("rejects a %s channel even when the client did not filter it", async (_label, type) => {
		const interaction = setting("logChannelId", { channel: channelOf(type) });
		await (await loadConfig()).chatInputSet(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
		expect(reply(interaction)).toContain("not a text or announcement channel");
	});

	it("accepts a random reply chance of 0 and 100, rejects 101", async () => {
		const command = await loadConfig();
		await command.chatInputSet(setting("randomResponseChance", { number: 0 }));
		expect(updateSettings).toHaveBeenLastCalledWith("g1", { randomResponseChance: 0 });
		await command.chatInputSet(setting("randomResponseChance", { number: 100 }));
		expect(updateSettings).toHaveBeenLastCalledWith("g1", { randomResponseChance: 100 });

		vi.mocked(updateSettings).mockClear();
		const interaction = setting("randomResponseChance", { number: 101 });
		await command.chatInputSet(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
		expect(reply(interaction)).toContain("between 0 and 100");
	});

	it("keeps the other numeric settings at 1 or more", async () => {
		const interaction = setting("starThreshold", { number: 0 });
		await (await loadConfig()).chatInputSet(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
		expect(reply(interaction)).toContain("between 1 and 1000");
	});

	it("refuses a setting that is not user-configurable", async () => {
		const interaction = setting("guildId", { text: "x" });
		await (await loadConfig()).chatInputSet(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
	});
});

describe("/config automod", () => {
	it("reports what changed", async () => {
		const interaction = interactionWith({ setting: "spamThreshold", number: 7 });
		await (await loadConfig()).chatInputAutoMod(interaction);
		expect(updateSettings).toHaveBeenCalledWith("g1", { autoModSpamThreshold: 7 });
		expect(reply(interaction)).toBe("✅ Auto-mod updated: spam threshold set to 7.");
	});

	it.each([
		["spamThreshold", {}],
		["maxMentions", {}],
		["muteDuration", {}],
		["badLinks", {}],
		["badLinks", { value: "warn" }],
		["action", {}],
		["action", { value: "true" }],
		["nonsense", {}],
	])("%s with %j changes nothing and says so", async (setting, extra) => {
		const interaction = interactionWith({ setting, ...extra });
		await (await loadConfig()).chatInputAutoMod(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
		expect(reply(interaction)).toMatch(/^❌ Nothing changed\./);
	});

	it("converts the mute duration from minutes to milliseconds", () => {
		expect(autoModChange("muteDuration", null, 10)).toMatchObject({ updates: { autoModMuteDuration: 600000 } });
	});

	it("bad-links false is an explicit change, not a default", () => {
		expect(autoModChange("badLinks", "false", null)).toMatchObject({ updates: { autoModBadLinks: false } });
	});

	it("never yields an empty update", () => {
		const settings = ["enable", "disable", "spamThreshold", "badLinks", "maxMentions", "action", "muteDuration", "x"];
		for (const setting of settings) {
			for (const [value, number] of [
				[null, null],
				["true", 5],
				["kick", 5],
			] as const) {
				const change = autoModChange(setting, value, number);
				if ("updates" in change) expect(Object.keys(change.updates).length).toBeGreaterThan(0);
			}
		}
	});
});

describe("/config antiraid", () => {
	it("reports what changed", async () => {
		const interaction = interactionWith({ setting: "window", number: 30 });
		await (await loadConfig()).chatInputAntiRaid(interaction);
		expect(updateSettings).toHaveBeenCalledWith("g1", { antiRaidJoinWindow: 30 });
		expect(reply(interaction)).toBe("✅ Anti-raid updated: join window set to 30s.");
	});

	it.each(["threshold", "window", "nonsense"])("%s without a number changes nothing and says so", async (setting) => {
		const interaction = interactionWith({ setting });
		await (await loadConfig()).chatInputAntiRaid(interaction);
		expect(updateSettings).not.toHaveBeenCalled();
		expect(reply(interaction)).toMatch(/^❌ Nothing changed\./);
	});

	it("enable and disable still work without a number", () => {
		expect(antiRaidChange("enable", null)).toMatchObject({ updates: { antiRaidEnabled: true } });
		expect(antiRaidChange("disable", null)).toMatchObject({ updates: { antiRaidEnabled: false } });
	});
});
