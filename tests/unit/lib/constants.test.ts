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
});
