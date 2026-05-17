import { execSync } from "node:child_process";
import { Pool } from "pg";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/bhayanakbot_test";

export default async function setup(): Promise<void> {
	process.env.DATABASE_URL = TEST_DB_URL;

	// Try to connect to the test database before running migrations
	const pool = new Pool({ connectionString: TEST_DB_URL });
	try {
		await pool.query("SELECT 1");
		await pool.end();
	} catch {
		await pool.end();
		console.warn(
			`[vitest globalSetup] Test database at ${TEST_DB_URL} is not reachable. Skipping migrations — integration tests may fail.`,
		);
		return;
	}

	// Run migrations against the test database
	execSync("pnpm db:migrate", {
		env: { ...process.env, DATABASE_URL: TEST_DB_URL },
		stdio: "inherit",
	});
}
