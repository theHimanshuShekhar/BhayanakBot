import { describe, expect, it } from "vitest";
import type { MinecraftPlayer } from "../../../src/lib/minecraftRcon.js";
import { channelNameSlug, playerChannelName } from "../../../src/scheduled-tasks/syncMinecraftTracker.js";

function player(overrides: Partial<MinecraftPlayer> = {}): MinecraftPlayer {
	return { name: "Athena", ...overrides };
}

describe("playerChannelName", () => {
	it("uses the Minecraft username", () => {
		expect(playerChannelName(player())).toBe("Athena");
	});

	it("trims whitespace and stays within Discord's 100 character limit", () => {
		expect(playerChannelName(player({ name: ` ${"x".repeat(120)} ` }))).toHaveLength(100);
	});
});

describe("channelNameSlug", () => {
	it("ignores Discord-normalized punctuation and casing", () => {
		expect(channelNameSlug("Athena_The-Great")).toBe(channelNameSlug("athena the great"));
	});
});
