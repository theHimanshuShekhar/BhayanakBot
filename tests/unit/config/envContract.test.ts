import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const VAR = "[A-Z][A-Z0-9_]*";

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(ts|astro)$/.test(entry.name) ? [path] : [];
	});
}

function matches(text: string, pattern: RegExp): string[] {
	return [...text.matchAll(pattern)].map((match) => match[1] as string);
}

/** Every variable the bot reads: `env.X` / `process.env.X`, the `envOr("X", ...)` helpers, and the zod schema keys. */
function botVariables(): Set<string> {
	const found = new Set<string>();
	for (const file of sourceFiles("src")) {
		const text = read(file);
		for (const name of matches(text, new RegExp(`\\benv\\.(${VAR})\\b`, "g"))) found.add(name);
		for (const name of matches(text, new RegExp(`\\b(?:optionalEnv|envOr|envIntOr)\\(\\s*"(${VAR})"`, "g"))) {
			found.add(name);
		}
		for (const name of matches(text, new RegExp(`Pick<NodeJS\\.ProcessEnv,\\s*"(${VAR})"`, "g"))) found.add(name);
	}
	for (const name of matches(read("src/lib/config.ts"), new RegExp(`^\\t(${VAR}):`, "gm"))) found.add(name);
	return found;
}

function webVariables(): Set<string> {
	const found = new Set<string>();
	for (const file of sourceFiles("web/src")) {
		const text = read(file);
		// `import.meta.env.X` for the PUBLIC_ vars, `process.env.X` for the ones read at request time.
		for (const name of matches(text, new RegExp(`(?:import\\.meta|process)\\.env\\.(${VAR})\\b`, "g"))) found.add(name);
	}
	return found;
}

/** The keys of one Compose service's `environment:` map. */
function composeEnvironment(service: string): Set<string> {
	const lines = read("docker-compose.yml").split("\n");
	const start = lines.indexOf(`  ${service}:`);
	expect(start, `service ${service} in docker-compose.yml`).toBeGreaterThanOrEqual(0);
	const found = new Set<string>();
	let inEnvironment = false;
	for (const line of lines.slice(start + 1)) {
		if (/^ {2}\S/.test(line)) break;
		if (/^ {4}\S/.test(line)) inEnvironment = line.trim() === "environment:";
		else if (inEnvironment) {
			const name = new RegExp(`^ {6}(${VAR}):`).exec(line)?.[1];
			if (name) found.add(name);
		}
	}
	return found;
}

const envExample = new Set(matches(read(".env.example"), new RegExp(`^#?\\s*(${VAR})=`, "gm")));
const agentsTable = new Set(matches(read("AGENTS.md"), new RegExp(`^\\| \`(${VAR})\` \\|`, "gm")));
const botCompose = composeEnvironment("bot");
const webCompose = composeEnvironment("web");

// Documented variables that nothing under src/ or web/src reads, with the reason each is still documented.
const DOCUMENTED_BUT_NOT_READ: Record<string, string> = {
	TEST_DATABASE_URL: "read by the Vitest global setup, not by the bot",
	POSTGRES_PASSWORD: "consumed by Compose for the Postgres service and the default DATABASE_URL",
	WEB_DATABASE_URL: "consumed by Compose as the web service's DATABASE_URL (opt-in SELECT-only bhayanak_web role)",
	WEB_PORT: "consumed by Compose for the web service's published port",
};

describe("environment contract", () => {
	const bot = botVariables();

	it("finds the variables the bot reads", () => {
		// Guards the scanner itself: if these vanish, the patterns above stopped matching.
		for (const name of [
			"DISCORD_TOKEN",
			"TARGET_GUILD_ID",
			"GUESS_WHO_BACKFILL_LIMIT",
			"ZEN_API_KEY",
			"PUBLIC_STATS_INTERVAL_MS",
			"DASHBOARD_PRESENCE_INTERVAL_MS",
			"YOUTUBE_COOKIE",
		]) {
			expect(bot, name).toContain(name);
		}
	});

	it("forwards every variable the bot reads to the bot container", () => {
		expect([...bot].filter((name) => !botCompose.has(name)).sort()).toEqual([]);
	});

	it("documents every variable the bot reads in .env.example", () => {
		expect([...bot].filter((name) => !envExample.has(name)).sort()).toEqual([]);
	});

	it("documents every variable the bot reads in the AGENTS.md table", () => {
		expect([...bot].filter((name) => !agentsTable.has(name)).sort()).toEqual([]);
	});

	it("documents no variable in the AGENTS.md table that nothing reads", () => {
		const web = webVariables();
		const dead = [...agentsTable].filter(
			(name) => !bot.has(name) && !web.has(name) && !(name in DOCUMENTED_BUT_NOT_READ),
		);
		expect(dead.sort()).toEqual([]);
	});

	it("keeps every allowlisted variable documented in .env.example and the AGENTS.md table", () => {
		for (const name of Object.keys(DOCUMENTED_BUT_NOT_READ)) {
			expect(envExample, `${name} in .env.example`).toContain(name);
			expect(agentsTable, `${name} in AGENTS.md`).toContain(name);
		}
	});

	it("forwards the web app's variables to the web container and documents them", () => {
		const web = webVariables();
		expect(web.size).toBeGreaterThan(0);
		for (const name of web) {
			expect(webCompose, `${name} in web service`).toContain(name);
			expect(envExample, `${name} in .env.example`).toContain(name);
			expect(agentsTable, `${name} in AGENTS.md`).toContain(name);
		}
	});

	it("derives the default DATABASE_URL password from POSTGRES_PASSWORD for the bot and web services", () => {
		// The bot reads DATABASE_URL; the web service reads WEB_DATABASE_URL (opt-in read-only role) and falls back to the same login.
		const defaults = matches(
			read("docker-compose.yml"),
			/DATABASE_URL: \$\{(?:WEB_)?DATABASE_URL:-(postgresql:\/\/\S+@postgres:5432\/bhayanakbot)\}/g,
		);
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Compose interpolation syntax, not a JS template
		const expected = "postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@postgres:5432/bhayanakbot";
		expect(defaults).toEqual([expected, expected]);
		const web = read("docker-compose.yml").split("\n  web:\n")[1] ?? "";
		expect(web).toContain("DATABASE_URL: ${WEB_DATABASE_URL:-");
	});

	it("documents the opt-in web database URL as the read-only role", () => {
		const example = /^#?\s*WEB_DATABASE_URL=(\S+)$/m.exec(read(".env.example"))?.[1];
		expect(example).toMatch(/^postgresql:\/\/bhayanak_web:[^@]+@postgres:5432\/bhayanakbot$/);
	});

	it("does not document the unused DISCORD_CLIENT_ID", () => {
		expect(envExample).not.toContain("DISCORD_CLIENT_ID");
		expect(agentsTable).not.toContain("DISCORD_CLIENT_ID");
		expect(botCompose).not.toContain("DISCORD_CLIENT_ID");
	});
});
