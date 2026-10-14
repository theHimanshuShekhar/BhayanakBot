import { describe, expect, it } from "vitest";
import { parseMinecraftRconList } from "../../../src/lib/minecraftRcon.js";

describe("parseMinecraftRconList", () => {
	it("parses the vanilla RCON list response", () => {
		expect(parseMinecraftRconList("There are 2 of a max of 20 players online: Athena, Z1N1")).toEqual([
			"Athena",
			"Z1N1",
		]);
	});

	it("returns an empty roster for a reachable server with nobody online", () => {
		expect(parseMinecraftRconList("There are 0 of a max of 20 players online:")).toEqual([]);
	});

	it("strips Minecraft formatting and whitespace from player names", () => {
		expect(parseMinecraftRconList("There are 2 of a max of 20 players online: §aAthena,  Z1N1  ")).toEqual([
			"Athena",
			"Z1N1",
		]);
	});

	it("rejects an unrecognized RCON response", () => {
		expect(parseMinecraftRconList("Unknown command")).toBeNull();
	});
});
