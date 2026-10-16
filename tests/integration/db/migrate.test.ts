import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "../../../src/db/migrate.js";
import { db } from "../../../src/lib/database.js";

describe("runMigrations", () => {
	it("points at the repository's drizzle folder", () => {
		expect(MIGRATIONS_FOLDER).toBe(path.resolve(__dirname, "../../../drizzle"));
	});

	it("is a no-op on a database `drizzle-kit migrate` already brought up to date", async () => {
		const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")) as {
			entries: unknown[];
		};
		const applied = async () => (await db.$client.query("SELECT id FROM drizzle.__drizzle_migrations")).rowCount;

		expect(await applied()).toBe(journal.entries.length);
		await runMigrations(process.env.DATABASE_URL as string);
		expect(await applied()).toBe(journal.entries.length);
	});
});
