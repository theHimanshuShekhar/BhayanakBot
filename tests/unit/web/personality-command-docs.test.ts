import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RAW_COMMANDS } from "../../../web/src/data/commands.js";

describe("personality command web docs", () => {
	it("catalog lists the view and refresh subcommands and who may use them", () => {
		const command = RAW_COMMANDS.find((entry) => entry.name === "/personality");

		expect(command?.description).toContain("user personality profile");
		expect(command?.description).toContain("server culture");
		expect(command?.examples).toContain("/personality view guild");
		expect(command?.examples).toContain("/personality refresh guild");
		expect(command?.usageNotes).toContain("every 6 hours");
		expect(command?.usageNotes).toContain("1,500 characters");
		expect(command?.usageNotes).toContain("Members can view only their own profile");
		expect(command?.usageNotes).not.toContain("currently disabled");
		expect(Object.keys(command?.subcommands ?? {})).toEqual([
			"view user",
			"view guild",
			"refresh user",
			"refresh guild",
		]);
	});

	it("content documents scheduled fixed-size generation and access, and avoids opt-in wording", async () => {
		const content = await readFile("web/src/content/commands/personality.mdx", "utf8");

		expect(content).toContain("/personality view user");
		expect(content).toContain("/personality view guild");
		expect(content).toContain("/personality refresh user");
		expect(content).toContain("/personality refresh guild");
		expect(content).toContain("within about 6 hours");
		expect(content).toContain("1,500 characters");
		expect(content).not.toContain("currently disabled");
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
