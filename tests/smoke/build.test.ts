import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("build smoke tests", () => {
	it("compiles TypeScript without errors", () => {
		expect(() => {
			execSync("npx tsc --noEmit", { stdio: "pipe" });
		}).not.toThrow();
	}, 15_000);

	it("can import BhayanakClient without errors", async () => {
		const { BhayanakClient } = await import("../../src/lib/BhayanakClient.js");
		expect(BhayanakClient).toBeDefined();
		expect(typeof BhayanakClient).toBe("function");
	});
});
