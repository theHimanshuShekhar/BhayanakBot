import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "../db/schema.js";
import { envOr } from "./env.js";

export function buildPoolConfig(connectionString: string): PoolConfig {
	return {
		connectionString,
		max: 10,
		application_name: "bhayanakbot",
		// Fail a checkout fast when Postgres is down or the pool is exhausted, instead of queueing forever.
		connectionTimeoutMillis: 10_000,
		idleTimeoutMillis: 30_000,
		// Cuts off runaway queries. Generous because personality and archive queries scan large message windows.
		statement_timeout: 60_000,
	};
}

const pool = new Pool(
	buildPoolConfig(envOr("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/bhayanakbot")),
);

pool.on("error", (err) => {
	console.error("[pg pool] Unexpected error on idle client:", err);
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;

/** Waits for checked-out clients to be released, then closes every connection. Call once, on shutdown. */
export function closeDatabase(): Promise<void> {
	return pool.end();
}
