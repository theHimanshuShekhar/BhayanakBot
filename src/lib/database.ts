import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.js";

const pool = new Pool({
	connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/bhayanakbot",
	max: 10,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
