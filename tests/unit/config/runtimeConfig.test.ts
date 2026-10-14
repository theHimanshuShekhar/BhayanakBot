import { describe, expect, it } from "vitest";
import { validateRuntimeConfig } from "../../../src/lib/config.js";

describe("Minecraft RCON runtime configuration", () => {
	it("accepts blank optional RCON connection settings", () => {
		expect(
			validateRuntimeConfig({
				DISCORD_TOKEN: "token",
				MINECRAFT_RCON_HOST: "",
				MINECRAFT_RCON_PORT: "",
				MINECRAFT_RCON_PASSWORD: "",
			}),
		).toMatchObject({ MINECRAFT_RCON_HOST: "", MINECRAFT_RCON_PORT: "", MINECRAFT_RCON_PASSWORD: "" });
	});

	it("rejects an out-of-range RCON port", () => {
		expect(() => validateRuntimeConfig({ DISCORD_TOKEN: "token", MINECRAFT_RCON_PORT: "65536" })).toThrow(
			"MINECRAFT_RCON_PORT",
		);
	});
});
