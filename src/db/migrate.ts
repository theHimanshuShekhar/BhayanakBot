// Applies the SQL migrations in drizzle/ with drizzle-orm's own migrator, the same code path `drizzle-kit migrate`
// runs. The production image has no dev dependencies, so it cannot use drizzle-kit; the Compose bot service runs
// `node dist/db/migrate.js` before the bot starts.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { envOr } from "../lib/env.js";

/** drizzle/ at the repository root; this file runs from src/db (tsx) or dist/db (compiled), two levels below it. */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

/** Applies every pending migration in `migrationsFolder` and closes the connection. */
export async function runMigrations(connectionString: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
	// A dedicated pool, not lib/database.ts: its 60s statement_timeout must not cut a long migration short.
	const pool = new Pool({ connectionString, max: 1 });
	try {
		await migrate(drizzle(pool), { migrationsFolder });
	} finally {
		await pool.end();
	}
}

if (require.main === module) {
	runMigrations(envOr("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/bhayanakbot")).then(
		() => console.log("Migrations applied."),
		(error: unknown) => {
			console.error("Migration failed:", error);
			process.exit(1);
		},
	);
}
