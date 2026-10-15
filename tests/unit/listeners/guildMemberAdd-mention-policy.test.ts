import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSettings } from "../../../src/db/queries/guildSettings.js";
import { GuildMemberAddListener } from "../../../src/listeners/guild/guildMemberAdd.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";
import { createListenerContext } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/guildSettings.js", () => ({ getOrCreateSettings: vi.fn() }));

describe("guildMemberAdd Mention Policy", () => {
	beforeEach(() => {
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
	});

	it("welcome message notifies only the newly joined member", async () => {
		vi.mocked(getOrCreateSettings).mockResolvedValue({
			antiRaidEnabled: false,
			welcomeChannelId: "welcome",
			welcomeMessage: "Hi {user} @everyone",
		} as never);
		const channel = { send: vi.fn(async () => null) };
		const member = {
			id: "new-member",
			user: { username: "newbie", displayAvatarURL: () => "https://example.com/a.png" },
			guild: {
				id: "guild-1",
				name: "Guild",
				memberCount: 5,
				channels: { cache: new Map([["welcome", channel]]) },
			},
		};

		await new GuildMemberAddListener(createListenerContext("src/listeners/guild/guildMemberAdd.ts"), {}).run(
			member as never,
		);

		const [sent] = channel.send.mock.calls[0] as unknown as [{ content: string; allowedMentions: unknown }];
		expect(sent.content).toBe("<@new-member>");
		expect(resolveAllowedMentions(sent)).toEqual({ ...NOTIFIES_NOBODY, users: ["new-member"] });
	});
});
