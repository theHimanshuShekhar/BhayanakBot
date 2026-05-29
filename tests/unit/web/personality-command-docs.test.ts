import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RAW_COMMANDS } from "../../../web/src/data/commands.js";

describe("personality command web docs", () => {
	it("catalog lists explicit user and guild subcommands", () => {
		const command = RAW_COMMANDS.find((entry) => entry.name === "/personality");

		expect(command?.description).toContain("user");
		expect(command?.description).toContain("server culture");
		expect(command?.examples).toContain("/personality view user user:@someone");
		expect(command?.examples).toContain("/personality view guild");
		expect(command?.examples).toContain("/personality refresh user user:@someone");
		expect(command?.examples).toContain("/personality refresh guild");
	});

	it("content matches archive-backed behavior and avoids opt-in wording", async () => {
		const content = await readFile("web/src/content/commands/personality.mdx", "utf8");

		expect(content).toContain("/personality view user");
		expect(content).toContain("/personality view guild");
		expect(content).toContain("/personality refresh user");
		expect(content).toContain("/personality refresh guild");
		expect(content).toContain("archived training evidence");
		expect(content).toContain("incremental refresh");
		expect(content).not.toMatch(/opt\s*-?in|consent/i);
	});

	it("public pages avoid opt-in and consent wording for personality", async () => {
		const [homePage, setupPage] = await Promise.all([
			readFile("web/src/pages/index.astro", "utf8"),
			readFile("web/src/pages/setup.astro", "utf8"),
		]);

		expect(`${homePage}\n${setupPage}`).not.toMatch(/opt\s*-?in|consent/i);
	});

	it("public pages use explicit personality subcommand groups", async () => {
		const homePage = await readFile("web/src/pages/index.astro", "utf8");

		expect(homePage).toContain("/personality view user");
		expect(homePage).not.toMatch(/\/personality(?:<\/code>)?\s+user:/);
	});

	it("public status surfaces avoid snapshot labels and hide unavailable latency", async () => {
		const [homePage, statusPage] = await Promise.all([
			readFile("web/src/pages/index.astro", "utf8"),
			readFile("web/src/pages/status.astro", "utf8"),
		]);
		const publicStatusPages = `${homePage}\n${statusPage}`;

		expect(publicStatusPages).not.toMatch(/snapshot available|snapshot unavailable|snapshot details|public snapshot/i);
		expect(statusPage).not.toContain("capturedAtLabel");
		expect(publicStatusPages).toContain("stats.latencyMs !== null");
	});
});
