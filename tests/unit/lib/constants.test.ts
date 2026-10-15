import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importConstants() {
	vi.resetModules();
	return import("../../../src/lib/constants.js");
}

describe("runtime constants", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
		vi.resetModules();
	});

	it("does not grant an implicit bot owner when BOT_OWNER_ID is unset", async () => {
		delete process.env.BOT_OWNER_ID;

		const { BOT_OWNER_ID } = await importConstants();

		expect(BOT_OWNER_ID).toBeUndefined();
	});

	it("treats a blank BOT_OWNER_ID as disabled", async () => {
		process.env.BOT_OWNER_ID = "   ";

		const { BOT_OWNER_ID } = await importConstants();

		expect(BOT_OWNER_ID).toBeUndefined();
	});

	it("uses the configured BOT_OWNER_ID when provided", async () => {
		process.env.BOT_OWNER_ID = "123456789012345678";

		const { BOT_OWNER_ID } = await importConstants();

		expect(BOT_OWNER_ID).toBe("123456789012345678");
	});

	it("falls back to the default Home Server when TARGET_GUILD_ID is blank", async () => {
		process.env.TARGET_GUILD_ID = "  ";

		const { TARGET_GUILD_ID } = await importConstants();

		expect(TARGET_GUILD_ID).toBe("199168135935295488");
	});

	it("uses the configured TARGET_GUILD_ID as the Home Server", async () => {
		process.env.TARGET_GUILD_ID = "123456789012345678";

		const { TARGET_GUILD_ID } = await importConstants();

		expect(TARGET_GUILD_ID).toBe("123456789012345678");
	});
});
