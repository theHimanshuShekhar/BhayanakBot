import { execSync } from "node:child_process";

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/bhayanakbot_test";

export default function setup(): void {
	process.env.DATABASE_URL = TEST_DB_URL;

	// Run migrations against the test database
	execSync("pnpm db:migrate", {
		env: { ...process.env, DATABASE_URL: TEST_DB_URL },
		stdio: "inherit",
	});
}
