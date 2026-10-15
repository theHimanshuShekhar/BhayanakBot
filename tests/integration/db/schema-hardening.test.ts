import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../src/lib/database.js";

const WEB_ROLE = "bhayanak_web";
const SNAPSHOT_TABLES = ["public_bot_stats_snapshots", "dashboard_presence_snapshots"];

describe("UTC pinning", () => {
	it("runs app pool sessions in UTC", async () => {
		const result = await db.execute<{ TimeZone: string }>(sql`SHOW TimeZone`);
		expect(result.rows[0]?.TimeZone).toBe("UTC");
	});
});

describe("indexes", () => {
	it("creates the hot-path indexes, partial for the polling tasks", async () => {
		const result = await db.execute<{ indexname: string; indexdef: string }>(
			sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
		);
		const defs = new Map(result.rows.map((row) => [row.indexname, row.indexdef]));

		for (const name of [
			"users_guild_xp_idx",
			"auto_responses_guild_idx",
			"mod_cases_guild_user_created_idx",
			"mod_cases_active_expiry_idx",
			"reminders_pending_remind_at_idx",
			"giveaways_running_ends_at_idx",
			"giveaways_unannounced_attempted_idx",
			"polls_open_expires_idx",
		]) {
			expect(defs.has(name), name).toBe(true);
		}
		for (const name of [
			"mod_cases_active_expiry_idx",
			"reminders_pending_remind_at_idx",
			"giveaways_running_ends_at_idx",
			"giveaways_unannounced_attempted_idx",
			"polls_open_expires_idx",
		]) {
			expect(defs.get(name), name).toContain(" WHERE ");
		}
	});
});

describe("web database role", () => {
	const password = randomBytes(12).toString("hex");
	let webPool: Pool;

	beforeAll(async () => {
		// The migration creates the role without a password; deployments set it with ALTER ROLE.
		await db.execute(sql.raw(`ALTER ROLE ${WEB_ROLE} PASSWORD '${password}'`));
		const url = new URL(process.env.DATABASE_URL as string);
		url.username = WEB_ROLE;
		url.password = password;
		webPool = new Pool({ connectionString: url.toString() });
	});

	afterAll(async () => {
		await webPool?.end();
		await db.execute(sql.raw(`ALTER ROLE ${WEB_ROLE} PASSWORD NULL`));
	});

	it.each(SNAPSHOT_TABLES)("can SELECT %s", async (table) => {
		await expect(webPool.query(`SELECT * FROM ${table}`)).resolves.toBeDefined();
	});

	it.each(SNAPSHOT_TABLES)("cannot write %s", async (table) => {
		await expect(webPool.query(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/);
	});

	it.each([
		"users",
		"guild_settings",
		"mod_cases",
		"archived_channel_messages",
		"bot_command_counters",
	])("cannot SELECT or INSERT %s", async (table) => {
		await expect(webPool.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
		await expect(webPool.query(`INSERT INTO ${table} DEFAULT VALUES`)).rejects.toThrow(/permission denied/);
	});

	it("holds SELECT on nothing but the snapshot tables", async () => {
		const result = await db.execute<{ table_name: string }>(
			sql`SELECT table_name FROM information_schema.role_table_grants WHERE grantee = ${WEB_ROLE} GROUP BY table_name`,
		);
		expect(result.rows.map((row) => row.table_name).sort()).toEqual([...SNAPSHOT_TABLES].sort());
	});
});
