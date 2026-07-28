import { describe, expect, it } from "vitest";
import { isPalworldConfigured, type PalworldPlayer } from "../../../src/lib/palworld.js";
import { channelNameSlug, playerChannelName } from "../../../src/scheduled-tasks/syncPalworldTracker.js";

function player(overrides: Partial<PalworldPlayer> = {}): PalworldPlayer {
	return { name: "Z1N1", accountName: "Athena", userId: "steam_76561198271516743", level: 80, ...overrides };
}

/** Approximates what Discord does to a text channel name it is given. */
function discordSanitize(name: string): string {
	return name.toLowerCase().replace(/\s+/g, "-");
}

describe("isPalworldConfigured", () => {
	it("needs only the admin key, since the URL falls back to the local server", () => {
		expect(isPalworldConfigured({ PALWORLD_ADMIN_KEY: "secret" })).toBe(true);
		expect(isPalworldConfigured({ PALWORLD_API_URL: "http://10.1.1.160:8212" })).toBe(false);
		expect(isPalworldConfigured({})).toBe(false);
	});
});

describe("playerChannelName", () => {
	it("uses the Steam account name, not the in-game character name", () => {
		expect(playerChannelName(player())).toBe("Athena - Lv 80");
	});

	it("falls back to the character name while the account name is still syncing", () => {
		expect(playerChannelName(player({ accountName: "" }))).toBe("Z1N1 - Lv 80");
	});

	it("falls back to the identity key when neither name is present", () => {
		expect(playerChannelName(player({ name: "", accountName: "" }))).toBe("pal-516743 - Lv 80");
	});

	it("stays within Discord's 100 character limit without losing the level", () => {
		const name = playerChannelName(player({ accountName: "x".repeat(200) }));
		expect(name.length).toBeLessThanOrEqual(100);
		expect(name.endsWith(" - Lv 80")).toBe(true);
	});
});

describe("channelNameSlug", () => {
	// If this round trip breaks, every sweep sees a mismatch and renames every channel,
	// burning the 2-per-10-minutes rename budget for no reason.
	it("matches a name against the form Discord actually stores", () => {
		for (const p of [player(), player({ name: "", accountName: "" }), player({ level: 1 })]) {
			const name = playerChannelName(p);
			expect(channelNameSlug(discordSanitize(name))).toBe(channelNameSlug(name));
		}
	});

	// Discord silently drops characters we cannot predict, so we drop them first —
	// otherwise these names would be renamed on every single sweep, forever.
	it("ignores characters Discord may or may not keep", () => {
		expect(channelNameSlug("Ω Athena! - Lv 80")).toBe(channelNameSlug("Athena - Lv 80"));
	});

	it("still separates a level change from a settled name", () => {
		expect(channelNameSlug(playerChannelName(player({ level: 81 })))).not.toBe(
			channelNameSlug(playerChannelName(player())),
		);
	});

	// The reason existing channels kept their old "character - account" name after the
	// switch to Steam names: a level-only comparison saw nothing to do.
	it("sees a name change even when the level is unchanged", () => {
		expect(channelNameSlug("z1n1-athena-lv-80")).not.toBe(channelNameSlug(playerChannelName(player())));
	});
});
